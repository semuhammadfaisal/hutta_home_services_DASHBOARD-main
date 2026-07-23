(() => {
    const $ = id => document.getElementById(id);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = fragment.get('token') || '';
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const date = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';

    function complete(decision, decisionAt) {
        $('satisfactionPending').hidden = true;
        $('satisfactionComplete').hidden = false;
        const issue = decision === 'issue_reported';
        $('satisfactionResultTitle').textContent = issue ? 'Your issue was reported' : 'Thank you for your feedback';
        $('satisfactionResultMessage').textContent = issue
            ? 'Our team has been notified and will review the details you provided.'
            : 'We’re glad the completed service meets your expectations.';
        $('satisfactionDecisionAt').textContent = decisionAt ? `Recorded ${date(decisionAt)}` : '';
    }

    async function submit(action) {
        const error = $('satisfactionFormError');
        const issueMessage = $('issueMessage').value.trim();
        error.hidden = true;
        if (action === 'report_issue' && issueMessage.length < 10) {
            error.textContent = 'Please describe the issue in at least 10 characters.';
            error.hidden = false;
            return;
        }
        document.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            const response = await fetch('/api/closeout/public/satisfaction', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Customer-Satisfaction-Token': token
                },
                body: JSON.stringify({ action, issueMessage })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to record your feedback.');
            complete(data.decision, data.decisionAt);
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
            document.querySelectorAll('button').forEach(button => { button.disabled = false; });
        }
    }

    async function load() {
        try {
            if (!token) throw new Error('The secure satisfaction token is missing.');
            const response = await fetch('/api/closeout/public/satisfaction', {
                credentials: 'omit',
                cache: 'no-store',
                headers: { 'X-Customer-Satisfaction-Token': token }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to load service details.');
            $('satisfactionReference').textContent = data.completionReference;
            $('satisfactionCompletedAt').textContent = data.completedAt ? `Completed ${date(data.completedAt)}` : '';
            $('satisfactionGreeting').textContent = `How did we do, ${data.customerName || 'customer'}?`;
            $('satisfactionService').textContent = data.service || 'your service';
            $('satisfactionLoading').hidden = true;
            $('satisfactionDocument').hidden = false;
            if (data.decision) complete(data.decision.decision, data.decision.decisionAt);
        } catch (error) {
            $('satisfactionLoading').hidden = true;
            $('satisfactionErrorMessage').textContent = error.message;
            $('satisfactionError').hidden = false;
        }
    }

    $('satisfiedButton').onclick = () => submit('satisfied');
    $('showIssueButton').onclick = () => { $('issuePanel').hidden = false; $('issueMessage').focus(); };
    $('cancelIssueButton').onclick = () => { $('issuePanel').hidden = true; $('issueMessage').value = ''; };
    $('submitIssueButton').onclick = () => submit('report_issue');
    load();
})();
