(() => {
  const form = document.getElementById('signup-form');
  const status = document.getElementById('signup-status');
  const button = form.querySelector('button');
  const emailInput = form.elements.namedItem('email');
  const config = window.LAD_WAITLIST || {};
  let submitting = false;
  function setStatus(kind, text) {
    status.dataset.kind = kind;
    status.textContent = text;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || form.elements.namedItem('company').value) return;
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      setStatus('error', 'Проверьте адрес почты — похоже, в нём ошибка.');
      emailInput.focus();
      return;
    }
    if (!config.endpoint) {
      setStatus('error', 'Запись ещё не подключена. Загляните чуть позже.');
      return;
    }
    submitting = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('', 'Отправляем…');
    let timeout;
    try {
      // AbortController also works on browsers without AbortSignal.timeout.
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ email, company: form.elements.namedItem('company').value }),
      });
      if (response.status === 429) {
        setStatus('error', 'Слишком много заявок. Попробуйте позже — ваш адрес остался в форме.');
        return;
      }
      if (!response.ok) throw new Error('Signup failed');
      form.reset();
      setStatus('success', `Спасибо! Напишем на ${email}, когда откроем доступ.`);
    } catch {
      setStatus('error', 'Не получилось отправить. Ваш адрес остался в форме — попробуйте ещё раз.');
    } finally {
      clearTimeout(timeout);
      submitting = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
