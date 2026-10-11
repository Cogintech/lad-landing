(() => {
  const form = document.getElementById('signup-form');
  const status = document.getElementById('signup-status');
  const button = form.querySelector('button');
  const emailInput = form.elements.namedItem('email');
  const config = window.LAD_WAITLIST || {};
  const verification = document.getElementById('signup-verification');
  let widget;
  let widgetSize;
  let submitting = false;
  function setStatus(kind, text) {
    status.dataset.kind = kind;
    status.textContent = text;
  }
  function renderVerification() {
    if (!config.turnstileSiteKey || !window.turnstile || submitting) return;
    // Flexible widgets need at least 300px, including on narrow phones.
    const size = verification.getBoundingClientRect().width < 300 ? 'compact' : 'flexible';
    if (widget !== undefined && widgetSize === size) return;
    if (widget !== undefined) window.turnstile.remove(widget);
    widgetSize = size;
    widget = window.turnstile.render('#signup-verification', {
      sitekey: config.turnstileSiteKey, action: 'waitlist', theme: 'dark', size,
      'error-callback': () => setStatus('error', 'Не удалось загрузить проверку. Обновите страницу и попробуйте снова.'),
      'expired-callback': () => window.turnstile.reset(widget),
    });
  }
  window.ladTurnstileReady = renderVerification;
  window.addEventListener('resize', renderVerification);
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
    let timeout;
    try {
      // AbortController also works on browsers without AbortSignal.timeout.
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ email, company: '', turnstileToken: token }),
      });
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
      if (widget !== undefined) window.turnstile.reset(widget);
      renderVerification();
    }
  });
})();
