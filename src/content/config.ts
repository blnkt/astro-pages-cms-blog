import { SITE } from "@config";
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      author: z.string().default(SITE.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["news"]),
      ogImage: image()
        .refine(img => img.width >= 1200 && img.height >= 630, {
          message: "OpenGraph image must be at least 1200 X 630 pixels!",
        })
        .or(z.string())
        .optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
    }),
});

const events = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    startDate: z.date(),
    endDate: z.date().optional().nullable(),
    venue: z.string(),
    location: z.string().optional(),
    ticketUrl: z.string().url().optional(),
    featured: z.boolean().default(false),
    summary: z.string(),
  }),
});

const music = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string(),
    releaseType: z.string(),
    year: z.number(),
    coverImage: z.string().optional(),
    listenUrl: z.string().url().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const videos = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string(),
    order: z.number().default(0),
    playlistUrl: z.string().url().optional(),
    videos: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
      })
    ),
  }),
});

export const collections = { blog, events, music, videos };
