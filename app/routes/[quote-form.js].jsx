// Storefront quote/logo form handler — served as a static JS file by this app.
//
// Load it from the theme with ONE line (e.g. in layout/theme.liquid), then
// DISABLE the old `custom-email` app-embed block so handlers don't double-bind:
//   <script src="https://custom-email-pearl.vercel.app/quote-form.js" defer></script>
//
// Source: recovered verbatim from the old app-embed's only surviving copy
// (HANDOVER-eps-upload.md §12.4), with the two fetch() URLs repointed to this
// app. It wires two storefront forms:
//   #shipping-form  -> JSON      -> /api/save-shipping-info
//   #shipping-form2 -> multipart -> /api/save-shipping
// The modal-2 references (myModalshipping2 / openModal_shipping2 / closeModal2)
// are dead code kept as-is (no such elements in the theme) — zero behavior change.

// Origin this app is deployed at. Update if the Vercel domain changes.
const APP_ORIGIN = "https://custom-email-pearl.vercel.app";

// Green confirmation shown after a successful submit. Replace with the exact
// live success markup if a pixel-perfect match is required (§12.4 note).
const SUCCESS_HTML =
  '<div style="padding:20px;border:1px solid #cfe8cf;background:#eaf6ea;border-radius:8px;text-align:center;color:#2e7d32;font-family:Arial,sans-serif;"><h3 style="margin:0 0 8px;">Thank you! Your request has been submitted.</h3><p style="margin:0;">Our team will get back to you shortly.</p></div>';

const SCRIPT = `
(function () {
  var SUCCESS_HTML = ${JSON.stringify(SUCCESS_HTML)};
  var SAVE_SHIPPING_INFO_URL = ${JSON.stringify(APP_ORIGIN + "/api/save-shipping-info")};
  var SAVE_SHIPPING_URL = ${JSON.stringify(APP_ORIGIN + "/api/save-shipping")};

  document.addEventListener('DOMContentLoaded', function () {
    var openBtn1 = document.getElementById('openModal_shipping');
    var openBtn1_2 = document.getElementById('openModal_shipping_2');
    var modal1 = document.getElementById('myModalshipping');
    var openBtn2 = document.getElementById('openModal_shipping2');   // dead: no such element
    var modal2 = document.getElementById('myModalshipping2');        // dead: no such element
    if (openBtn1 && modal1) openBtn1.addEventListener('click', function () { modal1.style.display = 'block'; });
    if (openBtn1_2 && modal1) openBtn1_2.addEventListener('click', function () { modal1.style.display = 'block'; });
    if (openBtn2 && modal2) openBtn2.addEventListener('click', function () { modal2.style.display = 'block'; });
    window.addEventListener('click', function (event) {
      if (event.target === modal1) modal1.style.display = 'none';
      if (event.target === modal2) modal2.style.display = 'none';
    });
  });

  // Global handlers referenced by inline onclick="" in the theme markup.
  window.closeModal1 = function () {
    var m = document.getElementById('myModalshipping');
    if (m) m.style.display = 'none';
  };
  window.closeModal2 = function () { // dead: no such element
    var m = document.getElementById('myModalshipping2');
    if (m) m.style.display = 'none';
  };

  document.addEventListener('DOMContentLoaded', function () {
    var form1 = document.getElementById('shipping-form');
    var form2 = document.getElementById('shipping-form2');

    if (form1) {
      form1.addEventListener('submit', function (event) {
        event.preventDefault();
        var formData = new FormData(form1);
        var btn = document.getElementById('submitBtn1');
        var text = btn ? btn.querySelector('.btn-text') : null;
        var loader = btn ? btn.querySelector('.btn-loader') : null;
        if (text) text.style.display = 'none';
        if (loader) loader.style.display = 'inline-block';
        if (btn) btn.style.padding = '23px';
        var data = {
          title: formData.get('title'), company: formData.get('company'), street: formData.get('street'),
          apt: formData.get('apt'), city: formData.get('city'), state: formData.get('state'),
          zip: formData.get('zip'), loading_dock: formData.get('loading_dock'), liftgate: formData.get('liftgate'),
          email: formData.get('email'), phone: formData.get('phone'), cartons: formData.get('cartons'),
          comments: formData.get('comments'), variant_id: formData.get('variant_id')
        };
        fetch(SAVE_SHIPPING_INFO_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        })
          .then(function (response) {
            if (response.ok) { form1.innerHTML = SUCCESS_HTML; }
            else { alert('Failed to save data.'); }
          })
          .catch(function (error) { console.error('Backend error:', error); alert('Error saving data.'); });
      });
    }

    if (form2) {
      form2.addEventListener('submit', function (event) {
        event.preventDefault();
        var formData2 = new FormData(form2);
        var btn = document.getElementById('submitBtn2');
        var text = btn ? btn.querySelector('.btn-text') : null;
        var loader = btn ? btn.querySelector('.btn-loader') : null;
        if (text) text.style.display = 'none';
        if (loader) loader.style.display = 'inline-block';
        if (btn) btn.style.padding = '23px';
        fetch(SAVE_SHIPPING_URL, {
          method: 'POST', body: formData2
        })
          .then(function (response) { return response.json(); })
          .then(function (result) { form2.innerHTML = SUCCESS_HTML; })
          .catch(function (error) { console.error('Error submitting form2:', error); });
      });
    }
  });
})();
`;

export const loader = async () => {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Cache at the edge/browser for 5 min; tweak as needed.
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
