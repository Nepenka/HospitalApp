"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "en" ? "en" : "ru";
  const cookieStore = await cookies();
  cookieStore.set("anafix-locale", locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
