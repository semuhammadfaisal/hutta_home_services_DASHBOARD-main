(() => {
    const $ = id => document.getElementById(id);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = fragment.get('token') || '';
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const previewUrls = new Set();
    const phoenix = value => value
        ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'medium', timeStyle: 'short' })
        : 'Not provided';

    function showError(message) {
        $('completionLoading').hidden = true;
        $('completionDocument').hidden = true;
        $('completionErrorMessage').textContent = message;
        $('completionError').hidden = false;
    }

    function fileSummary(input, output, label) {
        const files = [...input.files];
        output.textContent = files.length
            ? `${files.length} photo${files.length === 1 ? '' : 's'} selected`
            : 'No photos selected';
        if (files.length > 10) output.textContent = 'Maximum 10 photos allowed';
        let preview = input.closest('.completion-upload')?.querySelector('.completion-preview-grid');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'completion-preview-grid';
            input.closest('.completion-upload')?.append(preview);
        }
        [...preview.querySelectorAll('img')].forEach(image => {
            if (image.src.startsWith('blob:')) {
                URL.revokeObjectURL(image.src);
                previewUrls.delete(image.src);
            }
        });
        preview.innerHTML = files.map((file, index) => {
            const url = URL.createObjectURL(file);
            previewUrls.add(url);
            return `<article><img src="${url}" alt="${label} preview ${index + 1}"><span>${file.name.replace(/[<>&"']/g, '')}</span><button type="button" data-remove="${index}" aria-label="Remove ${file.name.replace(/[<>&"']/g, '')}">×</button></article>`;
        }).join('');
        preview.querySelectorAll('[data-remove]').forEach(button => {
            button.onclick = () => {
                const transfer = new DataTransfer();
                files.filter((_, index) => index !== Number(button.dataset.remove)).forEach(file => transfer.items.add(file));
                input.files = transfer.files;
                fileSummary(input, output, label);
            };
        });
        const selectionIsValid = files.length > 0 && files.length <= 10;
        input.closest('.completion-evidence-card')?.classList.toggle('has-files', selectionIsValid);
        const step = input.id === 'beforePhotos' ? $('beforeStep') : $('afterStep');
        step?.classList.toggle('is-complete', selectionIsValid);
    }

    async function load() {
        try {
            if (!token) throw new Error('The secure completion token is missing.');
            const response = await fetch('/api/closeout/public/completion', {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store',
                headers: { 'X-Vendor-Completion-Token': token }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to load the completion record.');
            $('completionReference').textContent = data.completionReference;
            $('workOrderReference').textContent = data.schedule?.workOrderReference
                ? `Work order ${data.schedule.workOrderReference}`
                : 'Vendor work order';
            $('completionCustomer').textContent = data.customer?.name || 'Customer';
            $('completionAddress').textContent = data.customer?.address || 'Service address unavailable';
            $('completionSchedule').textContent = `${phoenix(data.schedule?.scheduledStart)} – ${phoenix(data.schedule?.scheduledEnd)}`;
            $('completionService').textContent = data.job?.service || 'Service';
            $('completionScope').textContent = data.job?.scopeOfWork || data.job?.description || 'No additional scope details.';
            $('completionAccess').textContent = data.schedule?.accessInstructions || 'No special access instructions.';
            $('completionLoading').hidden = true;
            $('completionDocument').hidden = false;
        } catch (error) {
            showError(error.message);
        }
    }

    $('beforePhotos').addEventListener('change', event => fileSummary(event.currentTarget, $('beforePhotoCount'), 'Before photo'));
    $('afterPhotos').addEventListener('change', event => fileSummary(event.currentTarget, $('afterPhotoCount'), 'After photo'));
    const refreshConfirmationStep = () => {
        const ready = $('vendorEnteredName').value.trim().length >= 2 && $('completionConfirm').checked;
        $('detailsStep')?.classList.toggle('is-complete', ready);
    };
    $('vendorEnteredName').addEventListener('input', refreshConfirmationStep);
    $('completionConfirm').addEventListener('change', refreshConfirmationStep);
    $('vendorCompletionForm').addEventListener('submit', async event => {
        event.preventDefault();
        const before = [...$('beforePhotos').files];
        const after = [...$('afterPhotos').files];
        const enteredName = $('vendorEnteredName').value.trim();
        const error = $('completionFormError');
        error.hidden = true;
        if (!before.length || !after.length) {
            error.textContent = 'Add at least one before photo and one after photo.';
            error.hidden = false;
            return;
        }
        if (before.length > 10 || after.length > 10) {
            error.textContent = 'A maximum of 10 photos is allowed in each group.';
            error.hidden = false;
            return;
        }
        if (enteredName.length < 2 || !$('completionConfirm').checked) {
            error.textContent = 'Enter your full name and confirm the completion statement.';
            error.hidden = false;
            return;
        }
        const formData = new FormData();
        before.forEach(file => formData.append('beforePhotos', file));
        after.forEach(file => formData.append('afterPhotos', file));
        formData.append('completionNotes', $('completionNotes').value.trim());
        formData.append('vendorEnteredName', enteredName);
        const button = $('submitCompletion');
        let progress = $('vendorCompletionForm').querySelector('.completion-upload-progress');
        if (!progress) {
            progress = document.createElement('div');
            progress.className = 'completion-upload-progress';
            progress.setAttribute('role', 'progressbar');
            progress.setAttribute('aria-label', 'Photo upload and completion progress');
            progress.innerHTML = '<span></span><small>Preparing secure upload…</small>';
            button.before(progress);
        }
        progress.hidden = false;
        progress.setAttribute('aria-valuenow', '25');
        progress.querySelector('span').style.width = '25%';
        button.disabled = true;
        button.textContent = 'Submitting completion…';
        try {
            progress.setAttribute('aria-valuenow', '65');
            progress.querySelector('span').style.width = '65%';
            progress.querySelector('small').textContent = 'Uploading completion evidence…';
            const response = await fetch('/api/closeout/public/completion', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store',
                headers: { 'X-Vendor-Completion-Token': token },
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to submit completion.');
            progress.setAttribute('aria-valuenow', '100');
            progress.querySelector('span').style.width = '100%';
            $('completionDocument').hidden = true;
            $('successCompletionReference').textContent = data.completionReference;
            $('successInvoiceNumber').textContent = data.invoiceNumber;
            $('successCompletedAt').textContent = phoenix(data.completedAt);
            $('completionSuccess').hidden = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
            button.disabled = false;
            button.textContent = 'Mark Job Complete';
            progress.hidden = true;
            progress.querySelector('span').style.width = '0';
        }
    });
    load();
})();
