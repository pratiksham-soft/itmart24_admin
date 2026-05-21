import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
};

const ASSET_KEY = "sections/founder-vendor-program.liquid";
const REMOTE_ENDPOINT = "https://shavi.itmart24.com/api/custom-portfolio-pricing";
const LOCAL_ENDPOINT = "http://localhost:5000/api/custom-portfolio-pricing";
const FOUNDER_SUCCESS_MESSAGE =
  "Thank you for your interest in ITMart24. Our sales team has received your request and will review your details. We will contact you shortly.";

async function getLiveThemeId(): Promise<number> {
  const response = await shopifyRest.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const liveTheme = response.data.themes.find((theme) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Could not find the live Shopify theme.");
  }

  return liveTheme.id;
}

function patchSectionSource(source: string) {
  let patched = source;

  patched = patched.replace(
    '<form id="FounderVendorProgramForm" class="founder-vendor-program__form-shell" novalidate>',
    '<form id="FounderVendorProgramForm" class="founder-vendor-program__form-shell" novalidate action="javascript:void(0)" method="post" onsubmit="return false;" data-nocaptcha="true">'
  );

  patched = patched.replace(
    /<input([^>]*(?:id="FounderVendor-website"|id="founder-website"|name="website")[^>]*)>/i,
    (_match, attributes: string) => {
      const withoutType = attributes.replace(/\stype="[^"]*"/, "");
      const withoutPlaceholder = withoutType.replace(/\splaceholder="[^"]*"/, "");
      const withoutInputMode = withoutPlaceholder.replace(/\sinputmode="[^"]*"/, "");
      const withoutPattern = withoutInputMode.replace(/\spattern="[^"]*"/, "");
      return `<input${withoutPattern} type="text" placeholder="itmart24.com">`;
    }
  );

  patched = patched
    .replace(
      "var configuredEndpoint = '/apps/founder-vendor-program';",
      `var configuredEndpoint = '${REMOTE_ENDPOINT}';`
    )
    .replace(
      "var configuredEndpoint = '/apps/custom-portfolio-pricing';",
      `var configuredEndpoint = '${REMOTE_ENDPOINT}';`
    )
    .replace(
      "return 'http://localhost:5000/api/founder-vendor-program';",
      `return '${LOCAL_ENDPOINT}';`
    )
    .replace(
      "return 'http://localhost:5000/api/custom-portfolio-pricing';",
      `return '${LOCAL_ENDPOINT}';`
    );

  const submitSectionPattern =
    /form\.addEventListener\('submit', function \(event\) \{[\s\S]*?form\.dataset\.founderVendorBound = 'true';/;
  const submitSectionReplacement = `form.addEventListener('submit', function (event) {
        event.preventDefault();

        var payload = {
          leadType: 'founder_vendor_program',
          fullName: form.elements.fullName ? form.elements.fullName.value.trim() : '',
          businessEmail: form.elements.businessEmail ? form.elements.businessEmail.value.trim() : '',
          companyName: form.elements.companyName ? form.elements.companyName.value.trim() : '',
          website: form.elements.website ? form.elements.website.value.trim() : '',
          categories: getCheckedValues(form, 'categories'),
          phone: form.elements.phone ? form.elements.phone.value.trim() : '',
          message: form.elements.message ? form.elements.message.value.trim() : '',
          sourcePage: 'founder_vendor_program_page',
          shopifyPageId: '132191748335'
        };

        if (!form.checkValidity()) {
          setFormMessage(messageNode, 'Please complete all required fields before submitting.', 'error');
          form.reportValidity();
          return;
        }

        if (!isValidEmail(payload.businessEmail)) {
          setFormMessage(messageNode, 'Please enter a valid business email address.', 'error');
          return;
        }

        if (!payload.categories.length) {
          toggleCategoryErrorState(form, true);
          setFormMessage(messageNode, 'Please select at least one primary product category.', 'error');
          return;
        }

        toggleCategoryErrorState(form, false);

        var founderFullName = payload.fullName || payload.contactName || '';
        var founderPhone = payload.phone || '';
        var founderMessage = payload.message || '';
        var founderWebsite = payload.website || '';
        var normalizedFounderWebsite = founderWebsite;

        try {
          var founderParsedWebsite = new URL(/^https?:\\/\\//i.test(founderWebsite) ? founderWebsite : 'https://' + founderWebsite);
          if (['http:', 'https:'].includes(founderParsedWebsite.protocol) && founderParsedWebsite.hostname.indexOf('.') !== -1) {
            normalizedFounderWebsite = founderParsedWebsite.toString().replace(/\\/$/, '');
          } else {
            normalizedFounderWebsite = '';
          }
        } catch (_error) {
          normalizedFounderWebsite = '';
        }

        if (!normalizedFounderWebsite) {
          var founderWebsiteSlug = String(founderWebsite || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'website';
          normalizedFounderWebsite = 'https://' + founderWebsiteSlug + '.invalid';
        }

        payload = {
          leadType: 'custom_portfolio_pricing',
          companyName: payload.companyName,
          website: normalizedFounderWebsite,
          businessEmail: payload.businessEmail,
          contactName: founderFullName,
          jobTitle: '',
          country: '',
          productCountRange: '2-5 products',
          categories: payload.categories,
          promotionGoals: ['Long-term marketplace visibility'],
          visibilityLevel: 'Not sure, please recommend',
          budgetRange: 'Not decided yet',
          message: [
            'Founder Vendor Program Application',
            'Website entered: ' + (founderWebsite || 'Not provided'),
            'Phone / WhatsApp: ' + (founderPhone || 'Not provided'),
            'Message: ' + (founderMessage || 'Not provided')
          ].join('\\n'),
          sourcePage: 'founder_vendor_program_page',
          shopifyPageId: '132191748335'
        };

        if (submit && submit.disabled) {
          return;
        }

        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Submitting application...';
        }

        setFormMessage(messageNode, 'Submitting your application...', 'info');

        fetch(getFounderVendorEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (response) {
            return response.json().catch(function () {
              return {};
            }).then(function (body) {
              if (!response.ok || body.success === false) {
                throw new Error(body.message || 'Unable to submit your application right now.');
              }

              return body;
            });
          })
          .then(function (body) {
            form.reset();
            setFormMessage(
              messageNode,
              '${FOUNDER_SUCCESS_MESSAGE}',
              'success'
            );
          })
          .catch(function (error) {
            setFormMessage(messageNode, error.message || 'Unable to submit your application right now. Please try again shortly.', 'error');
          })
          .finally(function () {
            if (submit) {
              submit.disabled = false;
              submit.textContent = defaultSubmitText;
            }
          });
      });
      
      form.dataset.founderVendorBound = 'true';`;

  if (!submitSectionPattern.test(patched)) {
    throw new Error("Could not find founder vendor submit section in theme section.");
  }

  patched = patched.replace(submitSectionPattern, submitSectionReplacement);

  if (!patched.includes(REMOTE_ENDPOINT)) {
    throw new Error("Founder vendor section patch did not set the remote endpoint.");
  }

  return patched;
}

async function main() {
  const themeId = await getLiveThemeId();
  const response = await shopifyRest.get(`/themes/${themeId}/assets.json`, {
    params: {
      "asset[key]": ASSET_KEY,
    },
  });

  const currentSource = String(response.data?.asset?.value ?? "");

  if (!currentSource) {
    throw new Error(`Theme asset ${ASSET_KEY} is empty or missing.`);
  }

  const patchedSource = patchSectionSource(currentSource);

  await shopifyRest.put(`/themes/${themeId}/assets.json`, {
    asset: {
      key: ASSET_KEY,
      value: patchedSource,
    },
  });

  console.log(`Updated ${ASSET_KEY} on live theme ${themeId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
