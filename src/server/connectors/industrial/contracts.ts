import {z} from "zod";

export const industrialKindSchema = z.enum(["oracle", "wincc", "postgres"]);
export type IndustrialKind = z.infer<typeof industrialKindSchema>;

export const industrialResourceSchema = z.object({
  name: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
});

export const industrialActionSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("test")}),
  z.object({action: z.literal("discover")}),
  z.object({
    action: z.literal("enable"),
    assetId: z.string().min(1).max(200),
    resource: z.string().min(1).max(300),
    fields: z.array(z.string().min(1).max(300)).min(2).max(20),
    mapping: z.record(z.string(), z.string().min(1).max(300)),
  }).refine(value => new Set(value.fields).size === value.fields.length &&
    Object.keys(value.mapping).length >= 2 &&
    new Set(Object.values(value.mapping)).size === Object.keys(value.mapping).length &&
    Object.values(value.mapping).every(field => value.fields.includes(field)),
  {message: "Mapping must contain distinct selected fields."}),
]);
export type IndustrialAction = z.infer<typeof industrialActionSchema>;

export const industrialGatewayResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("test"),
    status: z.literal("healthy"),
    checkedAt: z.iso.datetime({offset: true}),
    message: z.string().min(1),
  }),
  z.object({
    action: z.literal("discover"),
    resources: z.array(industrialResourceSchema).min(1),
  }),
  z.object({
    action: z.literal("enable"),
    enabled: z.literal(true),
    mode: z.enum(["history", "stream"]),
    startedAt: z.iso.datetime({offset: true}),
    cursor: z.string().nullable(),
  }),
]);
export type IndustrialGatewayResponse = z.infer<typeof industrialGatewayResponseSchema>;
