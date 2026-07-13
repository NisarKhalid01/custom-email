import { json } from "@remix-run/node";

// Enhanced CORS headers for Vercel
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      }
    });
  }
  
  // Allow GET requests for health checks
  return json(
    { 
      message: "EPS Upload API - Use POST to upload files",
      endpoint: "/api/eps/upload",
      methods: ["GET", "POST", "OPTIONS"]
    },
    { status: 200, headers: corsHeaders }
  );
}

// Helper function to create timeout signal
function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

export async function action({ request }) {
  const startTime = Date.now();
  
  // Log request details for debugging
  console.log("API Request:", {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
  });
  
  try {
    // Validate environment variables
    const ADMIN_API_TOKEN = "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";
    const SHOP = "nws-test-3.myshopify.com";
    const API_VERSION = "2025-01";

    const formData = await request.formData();
    const file = formData.get("file");

    // Check if file exists (works in both browser and Node.js)
    if (!file) {
      return json({ error: "No file uploaded" }, { status: 400, headers: corsHeaders });
    }

    // Get file name - handle both File objects and File-like objects
    const fileName = file.name || (typeof file === "object" && "name" in file ? file.name : null);
    
    if (!fileName) {
      return json({ error: "File name not found" }, { status: 400, headers: corsHeaders });
    }

    // ✅ EPS validation
    if (!fileName.toLowerCase().endsWith(".eps")) {
      return json({ error: "Only EPS files allowed" }, { status: 400, headers: corsHeaders });
    }

    /* 1️⃣ STAGED UPLOAD */
    const timeout1 = createTimeoutSignal(15000);
    try {
      const stagedRes = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": ADMIN_API_TOKEN,
          },
          body: JSON.stringify({
            query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
              stagedUploadsCreate(input: $input) {
                stagedTargets { url resourceUrl parameters { name value } }
                userErrors { field message }
              }
            }`,
            variables: {
              input: [{
                resource: "FILE",
                filename: fileName,
                mimeType: "application/postscript",
                httpMethod: "POST",
              }],
            },
          }),
          signal: timeout1.signal,
        }
      );
      timeout1.cleanup();

      if (!stagedRes.ok) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders }
        );
      }

      const stagedJson = await stagedRes.json();
    
      // Check for GraphQL user errors
      const userErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        return json(
          { error: "Staged upload failed", userErrors },
          { status: 400, headers: corsHeaders }
        );
      }

      const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];

      if (!target) {
        return json(
          { error: "Failed to create staged upload" },
          { status: 500, headers: corsHeaders }
        );
      }

      /* 2️⃣ UPLOAD TO S3 / GOOGLE */
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      uploadForm.append("file", file);
      
      // Use longer timeout for file upload based on file size (estimate)
      const fileSize = file.size || 0;
      const uploadTimeout = Math.max(30000, Math.min(120000, fileSize / 1000));
      
      const timeout2 = createTimeoutSignal(uploadTimeout);
      try {
        const uploadRes = await fetch(target.url, {
          method: "POST",
          body: uploadForm,
          signal: timeout2.signal,
        });
        timeout2.cleanup();

        if (!uploadRes.ok) {
          return json(
            { error: "File upload failed" },
            { status: 500, headers: corsHeaders }
          );
        }
        
        // Don't wait for response body - just check status
        await uploadRes.text();

        /* 3️⃣ REGISTER FILE IN SHOPIFY */
        const timeout3 = createTimeoutSignal(15000);
        try {
          const fileCreateRes = await fetch(
            `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": ADMIN_API_TOKEN,
              },
              body: JSON.stringify({
                query: `mutation fileCreate($files: [FileCreateInput!]!) {
                  fileCreate(files: $files) {
                    files { id createdAt ... on GenericFile { url } }
                    userErrors { field message }
                  }
                }`,
                variables: {
                  files: [{
                    contentType: "FILE",
                    originalSource: target.resourceUrl,
                    alt: fileName,
                  }],
                },
              }),
              signal: timeout3.signal,
            }
          );
          timeout3.cleanup();

          if (!fileCreateRes.ok) {
            return json(
              { error: "Failed to register file" },
              { status: 500, headers: corsHeaders }
            );
          }

          const fileCreateJson = await fileCreateRes.json();
          
          // Check for GraphQL user errors
          const fileCreateErrors = fileCreateJson?.data?.fileCreate?.userErrors;
          if (fileCreateErrors && fileCreateErrors.length > 0) {
            return json(
              { error: "File registration failed", userErrors: fileCreateErrors },
              { status: 400, headers: corsHeaders }
            );
          }

          const createdFile = fileCreateJson?.data?.fileCreate?.files?.[0];

          if (!createdFile) {
            return json(
              { error: "File not registered" },
              { status: 500, headers: corsHeaders }
            );
          }

          const duration = Date.now() - startTime;
          console.log(`Upload completed in ${duration}ms`);
          
          return json(
            {
              fileId: createdFile.id,
              url: target.resourceUrl,
              createdAt: createdFile.createdAt,
            },
            { headers: corsHeaders }
          );
        } catch (timeoutErr) {
          timeout3.cleanup();
          if (timeoutErr.name === "AbortError") {
            throw new Error("File registration timeout");
          }
          throw timeoutErr;
        }
      } catch (timeoutErr) {
        timeout2.cleanup();
        if (timeoutErr.name === "AbortError") {
          throw new Error("File upload timeout");
        }
        throw timeoutErr;
      }
    } catch (timeoutErr) {
      timeout1.cleanup();
      if (timeoutErr.name === "AbortError") {
        throw new Error("Staged upload timeout");
      }
      throw timeoutErr;
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Upload error after ${duration}ms:`, {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    
    // Handle timeout errors
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return json(
        { error: "Request timeout. Please try again." },
        { status: 408, headers: corsHeaders }
      );
    }
    
    // Return error with CORS headers to prevent CORS issues
    return json(
      { 
        error: err.message || "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
