import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, LegacyCard, DataTable, Badge, Button, Tooltip } from "@shopify/polaris";
import prisma from "../db.server";
import React from "react";
import {
  DeleteIcon,
  ViewIcon
} from '@shopify/polaris-icons';
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const shippingData = await prisma.shippingData.findMany();

  if (!shippingData || shippingData.length === 0) {
    throw new Response("No data found", { status: 404 });
  }

  return json(shippingData);
};

export default function Index() {
  const shippingData = useLoaderData();
  const navigate = useNavigate();
  const rows = shippingData.map(item => [
    item.email || 'N/A',
    item.emailStatus === "true" ? <Badge tone="success">Success</Badge> : <Badge tone="critical">Failed</Badge>,
    item.phone || 'N/A',
    <Tooltip content="View Shipping Data"><Button onClick={() => navigate(`/app/shipping-data/${item.id}`)} icon={ViewIcon} accessibilityLabel="Add theme" /></Tooltip>
  ]);

  return (
    <Page title="Shipping Data">
      <LegacyCard>
        <DataTable
          columnContentTypes={[
            "text",
            "numeric",
            "numeric",
            "numeric",
            "numeric",
          ]}
          headings={[
            "Email Address",
            "Status",
            "Phone Number",
            "Actions",
          ]}
          rows={rows}
          footerContent={`Showing ${rows.length} of ${rows.length} results`}
        />
      </LegacyCard>
    </Page>
  );
}
