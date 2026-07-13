import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // Initialize EmailJS when the component mounts
    (function () {
      emailjs.init({
        publicKey: "q6ITPQW2dDGcPkce9", // Replace with your actual public key
      });
    })();
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        {/* EmailJS script should be added in the body for proper execution */}
        <script
          type="text/javascript"
          src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"
        ></script>
      </body>
    </html>
  );
}
