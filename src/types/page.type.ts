export interface PageType {
    title: string;
    subTitle?: string;
    slug: string;
    description?: string;
    subDescription?: string;
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string[];
    image?:string;
    coverImage?:string;
    status?: "draft" | "published" | "archived";
    publishDate?: string;
    createdBy?:string
  }
  