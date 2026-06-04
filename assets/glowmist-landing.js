(() => {
  const initCart = (root) => {
    if (root.dataset.glowmistCartReady === 'true') return;
    root.dataset.glowmistCartReady = 'true';

    const variantInput = root.querySelector('[data-glowmist-variant]');
    const quantityInput = root.querySelector('[data-glowmist-quantity]');
    const priceTargets = root.querySelectorAll('[data-glowmist-price]');
    const message = root.querySelector('[data-glowmist-message]');
    const buttons = root.querySelectorAll('[data-glowmist-add]');

    buttons.forEach((button) => {
      if (button.disabled) button.dataset.disabled = 'true';
    });

    const setMessage = (text, type = '') => {
      if (!message) return;
      message.textContent = text;
      message.dataset.type = type;
    };

    const setLoading = (isLoading) => {
      buttons.forEach((button) => {
        button.disabled = isLoading || button.dataset.disabled === 'true';
        button.classList.toggle('is-loading', isLoading);
        const label = button.querySelector('[data-glowmist-add-label]');
        if (label) label.textContent = isLoading ? 'Adding...' : button.dataset.defaultText;
      });
    };

    const addToCart = async () => {
      const id = variantInput?.value;
      const quantity = Math.max(parseInt(quantityInput?.value || '1', 10), 1);

      if (!id) {
        setMessage('Select a Shopify product in this section before adding to cart.', 'error');
        return;
      }

      setLoading(true);
      setMessage('');

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ id, quantity })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.description || 'Unable to add this product to cart.');
        }

        setMessage('Added to cart. Your GlowMist is waiting at checkout.', 'success');
        document.dispatchEvent(new CustomEvent('cart:refresh'));
        document.dispatchEvent(new CustomEvent('cart:open'));
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    buttons.forEach((button) => {
      button.dataset.defaultText = button.textContent.trim();
      button.addEventListener('click', addToCart);
    });

    if (variantInput?.tagName === 'SELECT') {
      variantInput.addEventListener('change', () => {
        const selectedOption = variantInput.options[variantInput.selectedIndex];
        const nextPrice = selectedOption?.dataset.price;
        if (nextPrice) priceTargets.forEach((target) => (target.textContent = nextPrice));
      });
    }
  };

  const initFaq = (root) => {
    if (root.dataset.glowmistFaqReady === 'true') return;
    root.dataset.glowmistFaqReady = 'true';

    root.querySelectorAll('[data-glowmist-faq-button]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('[data-glowmist-faq-item]');
        const panel = item.querySelector('[data-glowmist-faq-panel]');
        const isOpen = button.getAttribute('aria-expanded') === 'true';

        button.setAttribute('aria-expanded', String(!isOpen));
        item.classList.toggle('is-open', !isOpen);
        panel.style.maxHeight = isOpen ? '0px' : `${panel.scrollHeight}px`;
      });
    });
  };

  const initSticky = (sticky) => {
    if (sticky.dataset.glowmistStickyReady === 'true') return;
    sticky.dataset.glowmistStickyReady = 'true';

    const hero = document.querySelector('[data-glowmist-hero]');
    if (hero) {
      const observer = new IntersectionObserver(
        ([entry]) => sticky.classList.toggle('is-visible', !entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(hero);
      return;
    }

    const update = () => sticky.classList.toggle('is-visible', window.scrollY > 360);
    update();
    window.addEventListener('scroll', update, { passive: true });
  };

  const init = () => {
    document.querySelectorAll('[data-glowmist-cart]').forEach(initCart);
    document.querySelectorAll('[data-glowmist-faq]').forEach(initFaq);
    document.querySelectorAll('[data-glowmist-sticky]').forEach(initSticky);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
