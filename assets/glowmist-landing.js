(() => {
  const initCart = (root) => {
    if (root.dataset.glowmistCartReady === 'true') return;
    root.dataset.glowmistCartReady = 'true';

    const variantInput  = root.querySelector('[data-glowmist-variant]');
    const quantityInput = root.querySelector('[data-glowmist-quantity]');
    const priceTargets  = root.querySelectorAll('[data-glowmist-price]');
    const message       = root.querySelector('[data-glowmist-message]');
    const buttons       = root.querySelectorAll('[data-glowmist-add]');

    // Remember which buttons were already disabled by Liquid (out of stock)
    buttons.forEach((btn) => {
      if (btn.disabled) btn.dataset.disabled = 'true';
      btn.dataset.defaultText = btn.querySelector('[data-glowmist-add-label]')?.textContent.trim()
                                ?? btn.textContent.trim();
    });

    const setMessage = (text, type = '') => {
      if (!message) return;
      message.textContent  = text;
      message.dataset.type = type;
    };

    const setLoading = (isLoading) => {
      buttons.forEach((btn) => {
        btn.disabled = isLoading || btn.dataset.disabled === 'true';
        btn.classList.toggle('is-loading', isLoading);
        const label = btn.querySelector('[data-glowmist-add-label]');
        if (label) label.textContent = isLoading ? 'Adding…' : btn.dataset.defaultText;
      });
    };

    // ── FIX 1: one shared in-flight guard so concurrent clicks are ignored ──
    let isBusy = false;

    const addToCart = async () => {
      if (isBusy) return;

      const id       = variantInput?.value;
      const quantity = Math.max(parseInt(quantityInput?.value || '1', 10), 1);

      if (!id) {
        setMessage('Select a Shopify product in this section before adding to cart.', 'error');
        return;
      }

      isBusy = true;
      setLoading(true);
      setMessage('');

      try {
        const response = await fetch('/cart/add.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify({ id, quantity }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.description || 'Unable to add this product to cart.');
        }

        setMessage('Added to cart! Your GlowMist is waiting at checkout.', 'success');

        // ── Horizon theme: dispatch cart:update with the correct source ──
        // Horizon listens for this exact CustomEvent on `document`.
        // The source 'product-form-component' tells Horizon to both
        // re-fetch the cart contents AND open the drawer automatically.
        // Confirmed working on Horizon 3.0+ (Shopify dev forum, Nov 2025).
        const cartData = await fetch('/cart.js').then((r) => r.json()).catch(() => ({ item_count: quantity }));

        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              data: {
                itemCount: cartData.item_count ?? quantity,
                source: 'product-form-component',
              },
            },
          })
        );

        // ── Fallback: also set open = true on cart-drawer directly ──
        // Works for Horizon versions where cart:update alone doesn't open the panel.
        const horizonDrawer = document.querySelector('cart-drawer-component') ?? document.querySelector('cart-drawer');
        if (horizonDrawer) {
          // Small delay so Horizon's cart:update handler can re-render first
          setTimeout(() => { horizonDrawer.open = true; }, 80);
        }
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        setLoading(false);
        isBusy = false;
      }
    };

    // ── FIX 3: one listener per button, all call the same shared addToCart ──
    // (Previously each button's listener re-iterated *all* buttons, so clicking
    // the hero button also fired the sticky button's handler → 2–3 requests.)
    buttons.forEach((btn) => {
      btn.addEventListener('click', addToCart);
    });

    // Update displayed price when variant changes
    if (variantInput?.tagName === 'SELECT') {
      variantInput.addEventListener('change', () => {
        const selected  = variantInput.options[variantInput.selectedIndex];
        const nextPrice = selected?.dataset.price;
        if (nextPrice) priceTargets.forEach((t) => (t.textContent = nextPrice));
      });
    }
  };

  const initFaq = (root) => {
    if (root.dataset.glowmistFaqReady === 'true') return;
    root.dataset.glowmistFaqReady = 'true';

    root.querySelectorAll('[data-glowmist-faq-button]').forEach((button) => {
      button.addEventListener('click', () => {
        const item   = button.closest('[data-glowmist-faq-item]');
        const panel  = item.querySelector('[data-glowmist-faq-panel]');
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

  const initCarousel = (carousel) => {
    if (carousel.dataset.glowmistCarouselReady === 'true') return;
    carousel.dataset.glowmistCarouselReady = 'true';

    const slides   = Array.from(carousel.querySelectorAll('[data-glowmist-carousel-slide]'));
    const prev     = carousel.querySelector('[data-glowmist-carousel-prev]');
    const next     = carousel.querySelector('[data-glowmist-carousel-next]');
    const dotsRoot = carousel.querySelector('[data-glowmist-carousel-dots]');
    let index = 0;
    let timer;

    if (!slides.length) return;

    const dots = dotsRoot
      ? slides.map((_, dotIndex) => {
          const dot = document.createElement('button');
          dot.type      = 'button';
          dot.className = 'glowmist-carousel-dot';
          dot.setAttribute('aria-label', `Show image ${dotIndex + 1}`);
          dot.addEventListener('click', () => { show(dotIndex); restart(); });
          dotsRoot.appendChild(dot);
          return dot;
        })
      : [];

    const show = (nextIndex) => {
      index = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach((dot, i) => {
        const active = i === index;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-current', active ? 'true' : 'false');
      });
      carousel.classList.add('is-ready');
    };

    const restart = () => {
      window.clearInterval(timer);
      if (slides.length > 1) timer = window.setInterval(() => show(index + 1), 5000);
    };

    prev?.addEventListener('click', () => { show(index - 1); restart(); });
    next?.addEventListener('click', () => { show(index + 1); restart(); });

    carousel.addEventListener('mouseenter', () => window.clearInterval(timer));
    carousel.addEventListener('mouseleave', restart);
    carousel.addEventListener('focusin',    () => window.clearInterval(timer));
    carousel.addEventListener('focusout',   restart);

    show(0);
    restart();
  };

  const init = () => {
    document.querySelectorAll('[data-glowmist-cart]').forEach(initCart);
    document.querySelectorAll('[data-glowmist-faq]').forEach(initFaq);
    document.querySelectorAll('[data-glowmist-sticky]').forEach(initSticky);
    document.querySelectorAll('[data-glowmist-carousel]').forEach(initCarousel);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();