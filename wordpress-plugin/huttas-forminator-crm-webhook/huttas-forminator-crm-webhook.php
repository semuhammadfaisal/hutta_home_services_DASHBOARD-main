<?php
/**
 * Plugin Name: smplfix Forminator CRM Webhook
 * Description: Securely sends the smplfix Forminator request form to the smplfix CRM Stage 1 intake webhook.
 * Version: 2.1.0
 * Author: smplfix
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Huttas_Forminator_CRM_Webhook {
	const OPTION_KEY = 'huttas_forminator_crm_webhook_settings';
	const RETRY_HOOK = 'huttas_forminator_crm_webhook_retry';
	const MAX_ATTEMPTS = 5;

	private static $pending = array();
	private static $processed = array();
	private static $last_reference = '';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );

		// Capture the validated Forminator values and entry ID before Forminator stores them.
		add_action( 'forminator_custom_form_submit_before_set_fields', array( __CLASS__, 'capture_submission' ), 10, 3 );

		// Forminator uses one of these hooks depending on AJAX/page-reload behavior.
		add_action( 'forminator_form_after_save_entry', array( __CLASS__, 'after_submission' ), 20, 2 );
		add_action( 'forminator_form_after_handle_submit', array( __CLASS__, 'after_submission' ), 20, 2 );

		// Always run on a successful response, including forms that do not store submissions.
		add_filter( 'forminator_form_ajax_submit_response', array( __CLASS__, 'send_from_response' ), 5, 2 );
		add_filter( 'forminator_form_submit_response', array( __CLASS__, 'send_from_response' ), 5, 2 );
		add_filter( 'forminator_form_ajax_submit_response', array( __CLASS__, 'append_request_reference' ), 20, 2 );
		add_filter( 'forminator_form_submit_response', array( __CLASS__, 'append_request_reference' ), 20, 2 );
		add_action( self::RETRY_HOOK, array( __CLASS__, 'retry_submission' ), 10, 2 );
	}

	private static function defaults() {
		return array(
			'form_id'     => 0,
			'webhook_url' => '',
			'secret'      => '',
		);
	}

	private static function settings() {
		return wp_parse_args( get_option( self::OPTION_KEY, array() ), self::defaults() );
	}

	public static function register_settings() {
		register_setting(
			'huttas_forminator_crm_webhook_group',
			self::OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
				'default'           => self::defaults(),
			)
		);
	}

	public static function sanitize_settings( $input ) {
		$current = self::settings();
		$secret  = isset( $input['secret'] ) ? trim( (string) $input['secret'] ) : '';
		return array(
			'form_id'     => isset( $input['form_id'] ) ? absint( $input['form_id'] ) : 0,
			'webhook_url' => isset( $input['webhook_url'] ) ? esc_url_raw( trim( (string) $input['webhook_url'] ) ) : '',
			// Leaving the secret blank preserves the already-saved value.
			'secret'      => '' !== $secret ? sanitize_text_field( $secret ) : $current['secret'],
		);
	}

	public static function admin_menu() {
		add_options_page(
			'smplfix CRM Webhook',
			'smplfix CRM Webhook',
			'manage_options',
			'huttas-forminator-crm-webhook',
			array( __CLASS__, 'settings_page' )
		);
	}

	public static function settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings = self::settings();
		?>
		<div class="wrap">
			<h1>smplfix Forminator CRM Webhook</h1>
			<p>Connect the smplfix Forminator request form to Stage 1 in the CRM.</p>
			<form method="post" action="options.php">
				<?php settings_fields( 'huttas_forminator_crm_webhook_group' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="huttas-form-id">Forminator Form ID</label></th>
						<td><input id="huttas-form-id" class="regular-text" type="number" min="1" required name="<?php echo esc_attr( self::OPTION_KEY ); ?>[form_id]" value="<?php echo esc_attr( $settings['form_id'] ); ?>"><p class="description">The numeric ID shown by Forminator for the request form.</p></td>
					</tr>
					<tr>
						<th scope="row"><label for="huttas-webhook-url">CRM Webhook URL</label></th>
						<td><input id="huttas-webhook-url" class="large-text code" type="url" required name="<?php echo esc_attr( self::OPTION_KEY ); ?>[webhook_url]" value="<?php echo esc_attr( $settings['webhook_url'] ); ?>" placeholder="https://YOUR-RENDER-DOMAIN/api/integrations/website-requests"></td>
					</tr>
					<tr>
						<th scope="row"><label for="huttas-webhook-secret">Webhook Secret</label></th>
						<td><input id="huttas-webhook-secret" class="large-text code" type="password" autocomplete="new-password" name="<?php echo esc_attr( self::OPTION_KEY ); ?>[secret]" value="" placeholder="<?php echo $settings['secret'] ? esc_attr( 'Saved — leave blank to keep it' ) : esc_attr( 'Paste the same webhook secret used in Render' ); ?>"><p class="description">Must exactly match the configured webhook secret in Render and contain at least 32 characters.</p></td>
					</tr>
				</table>
				<h2>Expected Forminator fields</h2>
				<table class="widefat striped" style="max-width:700px"><thead><tr><th>Forminator ID</th><th>CRM field</th></tr></thead><tbody><tr><td><code>name-1</code></td><td>Customer name</td></tr><tr><td><code>phone-1</code></td><td>Customer phone</td></tr><tr><td><code>email-1</code></td><td>Customer email</td></tr><tr><td><code>textarea-1</code></td><td>Service details</td></tr><tr><td><code>consent-1</code></td><td>Marketing SMS consent</td></tr></tbody></table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	private static function configured_for( $form_id ) {
		$settings = self::settings();
		return (int) $form_id === (int) $settings['form_id']
			&& ! empty( $settings['webhook_url'] )
			&& strlen( (string) $settings['secret'] ) >= 32;
	}

	public static function capture_submission( $entry, $form_id, $field_data_array ) {
		if ( ! self::configured_for( $form_id ) ) {
			return;
		}

		$fields = array();
		foreach ( (array) $field_data_array as $field ) {
			if ( isset( $field['name'] ) ) {
				$fields[ (string) $field['name'] ] = isset( $field['value'] ) ? $field['value'] : '';
			}
		}

		$entry_id = 0;
		if ( is_object( $entry ) && isset( $entry->entry_id ) ) {
			$entry_id = absint( $entry->entry_id );
		}

		self::$pending[ (int) $form_id ] = self::build_payload( $form_id, $fields, $entry_id );
	}

	private static function build_payload( $form_id, $fields, $entry_id = 0 ) {
		$submission_key = $entry_id ? (string) $entry_id : wp_generate_uuid4();
		return array(
			'externalSubmissionId' => 'forminator-' . absint( $form_id ) . '-' . $submission_key,
			'submittedAt'          => gmdate( 'c' ),
			'name'                 => self::name_value( isset( $fields['name-1'] ) ? $fields['name-1'] : '' ),
			'phone'                => self::scalar_value( isset( $fields['phone-1'] ) ? $fields['phone-1'] : '' ),
			'email'                => sanitize_email( self::scalar_value( isset( $fields['email-1'] ) ? $fields['email-1'] : '' ) ),
			'serviceDetails'       => self::scalar_value( isset( $fields['textarea-1'] ) ? $fields['textarea-1'] : '' ),
			'marketingSmsConsent'  => self::consent_value( isset( $fields['consent-1'] ) ? $fields['consent-1'] : false ),
		);
	}

	private static function current_request_payload( $form_id ) {
		if ( ! empty( self::$pending[ $form_id ] ) ) {
			return self::$pending[ $form_id ];
		}

		$fields = array();
		if ( class_exists( 'Forminator_CForm_Front_Action' ) && ! empty( Forminator_CForm_Front_Action::$info['field_data_array'] ) ) {
			foreach ( (array) Forminator_CForm_Front_Action::$info['field_data_array'] as $field ) {
				if ( isset( $field['name'] ) ) {
					$fields[ (string) $field['name'] ] = isset( $field['value'] ) ? $field['value'] : '';
				}
			}
		}

		// Fallback for Forminator configurations that do not populate the static field array.
		foreach ( array( 'name-1', 'phone-1', 'email-1', 'textarea-1', 'consent-1' ) as $field_name ) {
			if ( ! isset( $fields[ $field_name ] ) && isset( $_POST[ $field_name ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
				$fields[ $field_name ] = wp_unslash( $_POST[ $field_name ] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing
			}
		}

		if ( empty( $fields['name-1'] ) || empty( $fields['phone-1'] ) || empty( $fields['email-1'] ) ) {
			return array();
		}

		$entry_id = 0;
		if ( function_exists( 'forminator_get_latest_entry_by_form_id' ) ) {
			$entry = forminator_get_latest_entry_by_form_id( $form_id );
			if ( is_object( $entry ) && isset( $entry->entry_id ) ) {
				$entry_id = absint( $entry->entry_id );
			}
		}
		self::$pending[ $form_id ] = self::build_payload( $form_id, $fields, $entry_id );
		return self::$pending[ $form_id ];
	}

	private static function scalar_value( $value ) {
		if ( is_scalar( $value ) ) {
			return sanitize_textarea_field( (string) $value );
		}
		if ( is_array( $value ) ) {
			$values = array();
			array_walk_recursive(
				$value,
				function ( $item ) use ( &$values ) {
					if ( is_scalar( $item ) ) {
						$values[] = sanitize_text_field( (string) $item );
					}
				}
			);
			return trim( implode( ' ', array_filter( $values ) ) );
		}
		return '';
	}

	private static function name_value( $value ) {
		if ( ! is_array( $value ) ) {
			return sanitize_text_field( (string) $value );
		}
		$parts = array();
		foreach ( array( 'first-name', 'middle-name', 'last-name', 'prefix' ) as $key ) {
			if ( ! empty( $value[ $key ] ) ) {
				$parts[] = sanitize_text_field( (string) $value[ $key ] );
			}
		}
		return $parts ? trim( implode( ' ', $parts ) ) : self::scalar_value( $value );
	}

	private static function consent_value( $value ) {
		if ( is_array( $value ) ) {
			return ! empty( array_filter( $value ) );
		}
		if ( true === $value || 1 === $value ) {
			return true;
		}
		return in_array( strtolower( trim( (string) $value ) ), array( '1', 'true', 'yes', 'on', 'checked', 'consent' ), true );
	}

	public static function after_submission( $form_id, $response ) {
		$form_id = absint( $form_id );
		if ( ! self::configured_for( $form_id ) ) {
			return;
		}
		if ( is_array( $response ) && isset( $response['success'] ) && ! $response['success'] ) {
			return;
		}

		$payload = self::current_request_payload( $form_id );
		self::dispatch_payload( $payload );
	}

	public static function send_from_response( $response, $form_id ) {
		$form_id = absint( $form_id );
		if ( ! self::configured_for( $form_id ) || ! is_array( $response ) || ( isset( $response['success'] ) && ! $response['success'] ) ) {
			return $response;
		}
		self::dispatch_payload( self::current_request_payload( $form_id ) );
		return $response;
	}

	private static function dispatch_payload( $payload ) {
		if ( ! is_array( $payload ) || empty( $payload['externalSubmissionId'] ) ) {
			return;
		}
		$key     = $payload['externalSubmissionId'];
		if ( isset( self::$processed[ $key ] ) ) {
			return;
		}
		self::$processed[ $key ] = true;

		$result = self::send_payload( $payload );
		if ( $result['success'] ) {
			self::$last_reference = isset( $result['requestReference'] ) ? sanitize_text_field( $result['requestReference'] ) : '';
			return;
		}

		self::schedule_retry( $payload, 1 );
	}

	private static function send_payload( $payload ) {
		$settings  = self::settings();
		$body      = wp_json_encode( $payload, JSON_UNESCAPED_SLASHES );
		$timestamp = (string) time();
		$signature = hash_hmac( 'sha256', $timestamp . '.' . $body, (string) $settings['secret'] );

		$response = wp_remote_post(
			$settings['webhook_url'],
			array(
				'timeout'     => 12,
				'redirection' => 0,
				'headers'     => array(
					'Content-Type'       => 'application/json',
					'Accept'             => 'application/json',
					'X-Huttas-Timestamp' => $timestamp,
					'X-Huttas-Signature' => $signature,
				),
				'body'        => $body,
				'data_format' => 'body',
			)
		);

		if ( is_wp_error( $response ) ) {
			error_log( 'smplfix CRM webhook network failure; submission queued for retry.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			return array( 'success' => false );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$data   = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $status >= 200 && $status < 300 && is_array( $data ) && ! empty( $data['success'] ) ) {
			return array(
				'success'          => true,
				'requestReference' => isset( $data['requestReference'] ) ? $data['requestReference'] : '',
			);
		}

		error_log( 'smplfix CRM webhook returned HTTP ' . $status . '; submission queued for retry.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		return array( 'success' => false );
	}

	private static function schedule_retry( $payload, $attempt ) {
		if ( $attempt >= self::MAX_ATTEMPTS ) {
			error_log( 'smplfix CRM webhook reached the retry limit. Check the CRM URL, secret, and WordPress cron.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			return;
		}
		$delays = array( 60, 300, 900, 3600 );
		$delay  = isset( $delays[ $attempt - 1 ] ) ? $delays[ $attempt - 1 ] : 3600;
		wp_schedule_single_event( time() + $delay, self::RETRY_HOOK, array( $payload, $attempt + 1 ) );
	}

	public static function retry_submission( $payload, $attempt ) {
		if ( ! is_array( $payload ) || empty( $payload['externalSubmissionId'] ) ) {
			return;
		}
		$result = self::send_payload( $payload );
		if ( ! $result['success'] ) {
			self::schedule_retry( $payload, absint( $attempt ) );
		}
	}

	public static function append_request_reference( $response, $form_id ) {
		if ( ! self::configured_for( $form_id ) || ! self::$last_reference || ! is_array( $response ) ) {
			return $response;
		}
		$message             = isset( $response['message'] ) ? wp_strip_all_tags( (string) $response['message'] ) . ' ' : '';
		$response['message'] = $message . 'Request reference: ' . self::$last_reference;
		return $response;
	}
}

Huttas_Forminator_CRM_Webhook::init();
