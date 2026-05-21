import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
};

const THEME_ASSET_KEY = "layout/theme.liquid";
const OVERRIDE_MARKER_START = "{% comment %} ITMART24_VENDOR_CUSTOM_PORTFOLIO_OVERRIDE_START {% endcomment %}";
const OVERRIDE_MARKER_END = "{% comment %} ITMART24_VENDOR_CUSTOM_PORTFOLIO_OVERRIDE_END {% endcomment %}";

const OVERRIDE_BLOCK = `
${OVERRIDE_MARKER_START}
<script id="itmart24-vendor-custom-portfolio-override">
  (function () {
    if (window.location.pathname !== '/pages/vendor') {
      return;
    }

    var endpoint = 'https://shavi.itmart24.com/api/custom-portfolio-pricing';
    var successMessage = 'Thank you for your interest in ITMart24 Custom Portfolio Pricing. Our sales team has received your request and will review your company details, product portfolio, and promotion goals. We will contact you shortly with a suitable portfolio package.';

    function getCheckedValues(form, name) {
      return Array.prototype.slice.call(
        form.querySelectorAll('input[name="' + name + '"]:checked')
      ).map(function (input) {
        return input.value;
      });
    }

    function normalizeProductCountRange(value) {
      var normalized = String(value || '').trim();
      var rangeMap = {
        '2-5 products': '2-5 products',
        '6-10 products': '11-25 products',
        '11-25 products': '11-25 products',
        '21-25 products': '11-25 products',
        '26-35 products': '26-50 products',
        '26-50 products': '26-50 products',
        '36-50 products': '26-50 products',
        '50+ products': '50+ products'
      };

      return rangeMap[normalized] || '2-5 products';
    }

    function slugifyWebsiteValue(value) {
      var normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return normalized || 'website';
    }

    function normalizeWebsiteForSubmission(value) {
      var raw = String(value || '').trim();

      if (!raw) {
        return '';
      }

      try {
        var parsed = new URL(/^https?:\\/\\//i.test(raw) ? raw : 'https://' + raw);
        if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.indexOf('.') !== -1) {
          return parsed.toString().replace(/\\/$/, '');
        }
      } catch (_error) {}

      return 'https://' + slugifyWebsiteValue(raw) + '.invalid';
    }

    function getMessageNode(form) {
      return (
        form.querySelector('[data-custom-portfolio-message]') ||
        form.querySelector('[data-custom-portfolio-status]')
      );
    }

    function setFormMessage(messageNode, text, state) {
      if (!messageNode) {
        return;
      }

      messageNode.textContent = text || '';
      messageNode.setAttribute('data-state', state || '');
      messageNode.style.fontSize = '1rem';
      messageNode.style.lineHeight = '1.5';
      messageNode.style.fontWeight = '400';
      if (messageNode.classList) {
        messageNode.classList.remove('is-success', 'is-error');
        if (state === 'success') {
          messageNode.classList.add('is-success');
        } else if (state === 'error') {
          messageNode.classList.add('is-error');
        }
      }
    }

    function validateForm(form, messageNode) {
      var email = form.elements.businessEmail ? form.elements.businessEmail.value.trim() : '';
      var categories = getCheckedValues(form, 'categories');
      var promotionGoals = getCheckedValues(form, 'promotionGoals');

      if (!form.checkValidity()) {
        setFormMessage(messageNode, 'Please complete all required fields before submitting.', 'error');
        form.reportValidity();
        return false;
      }

      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        setFormMessage(messageNode, 'Please enter a valid business email address.', 'error');
        return false;
      }

      if (!categories.length) {
        setFormMessage(messageNode, 'Please select at least one primary product category.', 'error');
        return false;
      }

      if (!promotionGoals.length) {
        setFormMessage(messageNode, 'Please select at least one promotion goal.', 'error');
        return false;
      }

      return true;
    }

    function bindForm(form) {
      if (!form || form.dataset.vendorOverrideBound === 'true') {
        return;
      }

      var websiteInput = form.elements.website;
      if (websiteInput) {
        websiteInput.setAttribute('type', 'text');
        websiteInput.setAttribute('placeholder', 'itmart24.com');
        websiteInput.removeAttribute('pattern');
        websiteInput.removeAttribute('inputmode');
      }

      form.dataset.vendorOverrideBound = 'true';
      form.setAttribute('action', 'javascript:void(0)');
      form.setAttribute('method', 'post');
      form.setAttribute('onsubmit', 'return false;');
      form.setAttribute('data-nocaptcha', 'true');

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        var messageNode = getMessageNode(form);
        var submit = form.querySelector('button[type="submit"], [data-custom-portfolio-submit]');
        var defaultSubmitText = submit ? submit.textContent : 'Request Custom Portfolio Pricing';

        if (!validateForm(form, messageNode) || (submit && submit.disabled)) {
          return;
        }

        var payload = {
          leadType: 'custom_portfolio_pricing',
          companyName: form.elements.companyName ? form.elements.companyName.value.trim() : '',
          website: normalizeWebsiteForSubmission(
            form.elements.website ? form.elements.website.value.trim() : ''
          ),
          businessEmail: form.elements.businessEmail ? form.elements.businessEmail.value.trim() : '',
          contactName: form.elements.contactName ? form.elements.contactName.value.trim() : '',
          jobTitle: form.elements.jobTitle ? form.elements.jobTitle.value.trim() : '',
          country: form.elements.country ? form.elements.country.value.trim() : '',
          productCountRange: normalizeProductCountRange(
            form.elements.productCountRange ? form.elements.productCountRange.value : ''
          ),
          categories: getCheckedValues(form, 'categories'),
          promotionGoals: getCheckedValues(form, 'promotionGoals'),
          visibilityLevel: form.elements.visibilityLevel ? form.elements.visibilityLevel.value : '',
          budgetRange: form.elements.budgetRange ? form.elements.budgetRange.value : '',
          message: [
            form.elements.message ? form.elements.message.value.trim() : '',
            'Website entered: ' + (form.elements.website ? form.elements.website.value.trim() : 'Not provided')
          ].filter(Boolean).join('\\n'),
          sourcePage: 'vendor_page',
          shopifyPageId: '124057551087'
        };

        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Submitting request...';
        }

        setFormMessage(messageNode, 'Submitting your request...', 'info');

        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (response) {
            return response.json().catch(function () {
              return {};
            }).then(function (body) {
              if (!response.ok || body.success === false) {
                throw new Error(body.message || 'Unable to submit your request right now.');
              }

              return body;
            });
          })
          .then(function () {
            form.reset();
            setFormMessage(messageNode, successMessage, 'success');
          })
          .catch(function (error) {
            setFormMessage(
              messageNode,
              error && error.message
                ? error.message
                : 'Unable to submit your request right now. Please try again shortly.',
              'error'
            );
          })
          .finally(function () {
            if (submit) {
              submit.disabled = false;
              submit.textContent = defaultSubmitText;
            }
          });
      }, true);
    }

    function init() {
      document.querySelectorAll('[data-custom-portfolio-form]').forEach(bindForm);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    new MutationObserver(init).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  })();
</script>
${OVERRIDE_MARKER_END}
`.trim();

async function getLiveThemeId(): Promise<number> {
  const response = await shopifyRest.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const liveTheme = response.data.themes.find((theme) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Could not find the live Shopify theme.");
  }

  return liveTheme.id;
}

function patchThemeLiquid(source: string) {
  const existingBlockPattern = new RegExp(
    `${OVERRIDE_MARKER_START.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\\s\\S]*?${OVERRIDE_MARKER_END.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`
  );

  if (existingBlockPattern.test(source)) {
    return source.replace(existingBlockPattern, OVERRIDE_BLOCK);
  }

  if (!source.includes("</body>")) {
    throw new Error("Could not find </body> in theme.liquid.");
  }

  return source.replace("</body>", `${OVERRIDE_BLOCK}\n</body>`);
}

async function main() {
  const themeId = await getLiveThemeId();
  const response = await shopifyRest.get(`/themes/${themeId}/assets.json`, {
    params: {
      "asset[key]": THEME_ASSET_KEY,
    },
  });

  const currentSource = String(response.data?.asset?.value ?? "");
  if (!currentSource) {
    throw new Error("theme.liquid is empty or missing.");
  }

  const patchedSource = patchThemeLiquid(currentSource);

  await shopifyRest.put(`/themes/${themeId}/assets.json`, {
    asset: {
      key: THEME_ASSET_KEY,
      value: patchedSource,
    },
  });

  console.log(`Updated ${THEME_ASSET_KEY} on live theme ${themeId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
