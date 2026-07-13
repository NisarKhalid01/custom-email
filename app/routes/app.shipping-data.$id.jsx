import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, LegacyCard, BlockStack, Badge, Text, Divider } from "@shopify/polaris";
import prisma from "../db.server";
import React from "react";

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  const id = params.id;
  const shippingData = await prisma.shippingData.findUnique({
    where: { id }, 
  });
console.log("Shipping Data:", shippingData);
  return json(shippingData);
};

export default function Index() {
  const shippingData = useLoaderData();
  return (
    <Page
      backAction={{content: 'Products', url: '/app'}}
      title={ shippingData.email }
      titleMetadata={shippingData.emailStatus === "true" ? <Badge tone="success">Success</Badge> : <Badge tone="critical">Failed</Badge>}
    >
      <LegacyCard title="Shipping Data" sectioned>
      <BlockStack gap="500">
        <Divider />
      <Text variant="bodySm"><strong>Company:</strong> {shippingData.company}</Text>
          <Text variant="bodySm"><strong>Email:</strong> {shippingData.email}</Text>
          <Text variant="bodySm"><strong>Phone:</strong> {shippingData.phone}</Text>
          <Divider />
          <Text variant="bodySm"><strong>Street:</strong> {shippingData.street}</Text>
          <Text variant="bodySm"><strong>Apt:</strong> {shippingData.apt}</Text>
          <Text variant="bodySm"><strong>City:</strong> {shippingData.city}</Text>
          <Text variant="bodySm"><strong>State:</strong> {shippingData.state}</Text>
          <Text variant="bodySm"><strong>ZIP:</strong> {shippingData.zip}</Text>
          <Divider />
          <Text variant="bodySm"><strong>Loading Dock:</strong> {shippingData.loading_dock}</Text>
          <Text variant="bodySm"><strong>Liftgate:</strong> {shippingData.liftgate}</Text>
          <Divider />
          <Text variant="bodySm"><strong>Cartons:</strong> {shippingData.cartons}</Text>
          <Text variant="bodySm"><strong>Comments:</strong> {shippingData.comments}</Text>
          <Text variant="bodySm"><strong>Variant ID:</strong> {shippingData.variant_id}</Text>
        </BlockStack>
      </LegacyCard>
    </Page>
  );
}
