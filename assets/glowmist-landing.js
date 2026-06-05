(() => {


  let drawerBuyGuardBusy = false;

  document.addEventListener('on:cart:add', async (event) => {
    if (drawerBuyGuardBusy) return;

    const variantId = event?.detail?.variantId
                   ?? event?.detail?.variant_id
                   ?? event?.detail?.id;
    const newQty    = event?.detail?.quantity ?? event?.detail?.item_count;

    if (!variantId || newQty == null) return;


    if (newQty === 2) {
      drawerBuyGuardBusy = true;
      try {
        await fetch('/cart/change.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: String(variantId), quantity: 3 }),
        });

        // Re-render the drawer so it shows qty 3 + the discount badge
        await refreshHorizonDrawer();
      } catch (_) {
        // silently ignore — worst case customer sees qty 2, still gets
        // the Shopify automatic discount at checkout
      } finally {
        drawerBuyGuardBusy = false;
      }
    }
  });

  const _origFetch = window.fetch;
  let   _interceptBusy = false;

  window.fetch = async function (...args) {
    const url     = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
    const isChange = url.includes('/cart/change.js') || url.includes('/cart/update.js');

    // Let the original request through first
    const result = await _origFetch.apply(this, args);

    // Only react to drawer qty changes, not our own bump calls
    if (isChange && !_interceptBusy && !drawerBuyGuardBusy) {
      // Clone the response so we can read it without consuming it
      const clone = result.clone();
      clone.json().then(async (cart) => {
        if (!Array.isArray(cart?.items)) return;

        // Parse the body of the original request to know which variant changed
        let changedId  = null;
        let changedQty = null;
        try {
          const body = typeof args[1]?.body === 'string'
            ? JSON.parse(args[1].body)
            : null;
          changedId  = body?.id ?? body?.line;
          changedQty = body?.quantity;
        } catch (_) {}

        if (changedId == null || changedQty == null) return;

        // Find the item in the returned cart by variant_id or line key
        const item = cart.items.find(
          (i) => String(i.variant_id) === String(changedId)
               || String(i.key)        === String(changedId)
               || i.line               === changedId
        );

        if (!item) return;

        // Only bump when the returned cart shows exactly 2 of this variant
        if (item.quantity === 2) {
          _interceptBusy = true;
          try {
            await _origFetch('/cart/change.js', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ id: String(item.variant_id), quantity: 3 }),
            });
            await refreshHorizonDrawer();
          } catch (_) {}
          finally { _interceptBusy = false; }
        }
      }).catch(() => {});
    }

    return result;
  };

  // ── Refresh the Horizon drawer HTML without opening it ──
  const refreshHorizonDrawer = async () => {
    const cartData = await _origFetch('/cart.js').then((r) => r.json()).catch(() => ({}));

    try {
      const { CartUpdateEvent } = await import('@theme/events');
      document.dispatchEvent(
        new CartUpdateEvent(cartData, 'product-form-component', {
          itemCount: cartData.item_count,
          source: 'product-form-component',
          sections: {},
        })
      );
    } catch (_) {}

    document.dispatchEvent(
      new CustomEvent('cart:update', {
        bubbles: true,
        detail: { data: { itemCount: cartData.item_count, source: 'product-form-component' } },
      })
    );
  };

  // ── Open the Horizon drawer (used after ATC from landing section) ──
  const openHorizonDrawer = async () => {
    await refreshHorizonDrawer();

    const drawer =
      document.querySelector('cart-drawer-component') ??
      document.querySelector('cart-drawer');

    if (drawer) {
      requestAnimationFrame(() => {
        if (typeof drawer.open === 'function') drawer.open();
        else drawer.open = true;
      });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // SECTION: GlowMist landing page cart widget
  // ─────────────────────────────────────────────────────────────

  const initCart = (root) => {
    if (root.dataset.glowmistCartReady === 'true') return;
    root.dataset.glowmistCartReady = 'true';

    const variantInput  = root.querySelector('[data-glowmist-variant]');
    const quantityInput = root.querySelector('[data-glowmist-quantity]');
    const priceTargets  = root.querySelectorAll('[data-glowmist-price]');
    const message       = root.querySelector('[data-glowmist-message]');
    const buttons       = root.querySelectorAll('[data-glowmist-add]');

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
        if (label) label.textContent = isLoading ? 'Adding\u2026' : btn.dataset.defaultText;
      });
    };

    // Buy 2 Get 1 for the ATC button — uses pre-add snapshot so qty=1
    // on an empty cart never incorrectly triggers the bonus.
    const applyBuy2Get1 = async (id, quantityAdded, preExistingQty) => {
      const totalBefore = preExistingQty;
      const totalAfter  = preExistingQty + quantityAdded;

      if (totalBefore < 2 && totalAfter === 2) {
        await _origFetch('/cart/change.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id, quantity: 3 }),
        });
        return true;
      }
      return false;
    };

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
        // Snapshot cart BEFORE add so pre-existing qty is accurate
        const cartBefore     = await _origFetch('/cart.js').then((r) => r.json()).catch(() => ({ items: [] }));
        const existingItem   = cartBefore.items?.find((i) => String(i.variant_id) === String(id));
        const preExistingQty = existingItem?.quantity ?? 0;

        // Add the customer's chosen quantity
        const response = await _origFetch('/cart/add.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify({ id, quantity }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.description || 'Unable to add this product to cart.');
        }

        // Bump to 3 if threshold hit (guarded against fetch interceptor)
        _interceptBusy = true;
        const bonusAdded = await applyBuy2Get1(id, quantity, preExistingQty);
        _interceptBusy = false;

        setMessage(
          bonusAdded
            ? '\uD83C\uDF81 1 free item added! Your Buy 2 Get 1 deal is applied.'
            : 'Added to cart! Your GlowMist is waiting at checkout.',
          'success'
        );

        await openHorizonDrawer();

      } catch (error) {
        _interceptBusy = false;
        setMessage(error.message, 'error');
      } finally {
        setLoading(false);
        isBusy = false;
      }
    };

    buttons.forEach((btn) => btn.addEventListener('click', addToCart));

    if (variantInput?.tagName === 'SELECT') {
      variantInput.addEventListener('change', () => {
        const selected  = variantInput.options[variantInput.selectedIndex];
        const nextPrice = selected?.dataset.price;
        if (nextPrice) priceTargets.forEach((t) => (t.textContent = nextPrice));
      });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // FAQ, Sticky bar, Carousel — unchanged
  // ─────────────────────────────────────────────────────────────

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