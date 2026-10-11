(() => {
  const form = document.getElementById('signup-form');
  const status = document.getElementById('signup-status');
  const button = form.querySelector('button');
  const emailInput = form.elements.namedItem('email');
  const config = window.LAD_WAITLIST || {};
  let widget;
  let submitting = false;
  function setStatus(kind, text) {
    status.dataset.kind = kind;
    status.textContent = text;
  }
  window.ladTurnstileReady = () => {
    if (!config.turnstileSiteKey) return;
    widget = window.turnstile.render('#signup-verification', {
      sitekey: config.turnstileSiteKey, action: 'waitlist', theme: 'dark', size: 'flexible',
      'error-callback': () => setStatus('error', 'Не удалось загрузить проверку. Обновите страницу и попробуйте снова.'),
      'expired-callback': () => window.turnstile.reset(widget),
    });
  };
  if (config.turnstileSiteKey) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ladTurnstileReady&render=explicit';
    script.async = true;
    script.onerror = () => setStatus('error', 'Не удалось загрузить проверку. Обновите страницу и попробуйте снова.');
    document.head.appendChild(script);
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
    if (!config.endpoint || !config.turnstileSiteKey) {
      setStatus('error', 'Запись ещё не подключена. Загляните чуть позже.');
      return;
    }
    const token = widget === undefined ? '' : window.turnstile.getResponse(widget);
    if (!token) {
      setStatus('error', 'Дождитесь проверки перед отправкой.');
      return;
    }
    submitting = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('', 'Отправляем…');
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ email, company: '', turnstileToken: token }),
      });
      if (!response.ok) throw new Error('Signup failed');
      form.reset();
      setStatus('success', `Спасибо! Напишем на ${email}, когда откроем доступ.`);
    } catch {
      setStatus('error', 'Не получилось отправить. Ваш адрес остался в форме — попробуйте ещё раз.');
    } finally {
      submitting = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
      if (widget !== undefined) window.turnstile.reset(widget);
    }
  });
})();
