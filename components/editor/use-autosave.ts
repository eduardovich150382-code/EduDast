"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocumentContent } from "@/lib/documents/blocks";
import { AUTOSAVE_MS, createDebouncer } from "@/lib/documents/autosave";
import { contentIssues, type ContentIssues } from "@/lib/documents/editor-validity";
import { saveDocument } from "@/server/document-actions";

/**
 * Avtosaqlash (13-sessiya, 3-band).
 *
 * `useOptimistic` ISHLATILMADI — spekdan ONGLI CHEKINISH. U server
 * qaytargan qiymat bilan murosaga keladigan narsa bo'lganda ma'noli;
 * bu yerda esa haqiqat manbai lokal holat va `saveDocument` kontent
 * qaytarmaydi, ya'ni u sun'iy qatlam bo'lardi. Spekning maqsadi
 * ("o'zgarish darhol ko'rinsin") `useState<DocumentContent>` bilan
 * allaqachon bajariladi, qolgani esa aniq saqlash holatini ko'rsatish.
 *
 * OXIRGI YOZUV YUTADI. `saveDocument` butun `contentJson` ni almashtiradi
 * va versiya tekshiruvi YO'Q, ya'ni hujjat ikki tabda ochilsa biri
 * ikkinchisining ishini ustiga yozadi. Foydalanuvchi yakka bo'lgani uchun
 * v1 da bu ongli ravishda QABUL QILINDI — bu kashfiyot emas, qaror.
 * Kerak bo'lganda yechim `Document` ga versiya ustuni qo'shib,
 * `updateMany` ning `where` iga shu versiyani kiritish.
 *
 * KLIENT DARVOZASI QOROVOL EMAS: nosog'lom kontentda so'rov umuman
 * yuborilmaydi (har 1.5 soniyada bilib rad etiladigan so'rov va toast
 * bo'roni bo'lmasin), lekin `saveDocument` o'z Zod tekshiruvini saqlab
 * qoladi (CLAUDE.md 6-qoida).
 */
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "invalid" | "error";

export function useAutosave({
  documentId,
  content,
}: {
  documentId: string;
  content: DocumentContent;
}): { state: SaveState; issues: ContentIssues | null } {
  const tE = useTranslations("Editor");
  const [state, setState] = useState<SaveState>("idle");
  const [issues, setIssues] = useState<ContentIssues | null>(null);

  // Saqlangan (yoki boshlang'ich) kontent. Ochilishda saqlash
  // BOSHLANMASLIGI uchun kerak: birinchi renderda `content` aynan shu
  // obyekt bo'ladi.
  const baseline = useRef(content);
  // Toast FAQAT xatoga O'TGANDA bir marta — aks holda oflayn yozuvda har
  // 1.5 soniyada yangi toast chiqardi (`generation-progress.tsx:153`
  // dagi ayni sabab).
  const errored = useRef(false);
  const debouncer = useRef(createDebouncer(AUTOSAVE_MS));

  // Xabarlar SATR sifatida ajratilgan, `tE` emas: `runSave` ning
  // bog'liqliklari o'zgarmas bo'lishi SHART. Aks holda har render yangi
  // funksiya yasab, debounce effektini qayta ishga tushirar va
  // "saqlandi -> render -> yangi taymer -> saqlash" halqasi chiqardi.
  const invalidMessage = tE("errors.invalid");
  const missingMessage = tE("errors.topilmadi");
  const genericMessage = tE("errors.generic");

  const runSave = useCallback(
    (value: DocumentContent) => {
      const found = contentIssues(value);
      setIssues(found);
      if (found !== null) {
        setState("invalid");
        return;
      }
      setState("saving");
      void saveDocument({ id: documentId, content: value }).then(
        (result) => {
          if (result.ok) {
            baseline.current = value;
            errored.current = false;
            setState("saved");
            return;
          }
          if (!errored.current) {
            errored.current = true;
            toast.error(result.error === "invalid" ? invalidMessage : missingMessage);
          }
          setState("error");
        },
        () => {
          // Tarmoq uzilgan: YOZGAN MATN LOKAL HOLATDA QOLADI, shuning uchun
          // qaytadan ulanganda keyingi o'zgarish uni o'zi saqlaydi.
          if (!errored.current) {
            errored.current = true;
            toast.error(genericMessage);
          }
          setState("error");
        },
      );
    },
    [documentId, invalidMessage, missingMessage, genericMessage],
  );

  // 1) DEBOUNCE. Tozalagich FAQAT taymerni o'chiradi, saqlamaydi — aks
  // holda u `content` har o'zgarganda ishlab, har bosilgan harfda so'rov
  // yuborardi va 1.5 soniyalik kutish umuman ishlamasdi.
  useEffect(() => {
    if (content === baseline.current) return;
    setState("dirty");
    const pending = debouncer.current;
    pending.schedule(() => {
      runSave(content);
    });
    return () => {
      pending.cancelTimer();
    };
  }, [content, runSave]);

  // 2) KOMPONENT YO'QOLGANDA kutib turgan ishni bajaradi: ilova ichidagi
  // navigatsiyani `beforeunload` ushlamaydi. Kutib turgan yopilma eng
  // oxirgi kontentni ushlab turadi, `cancelTimer` esa ishni saqlab
  // qoladi — ya'ni tozalagichlar tartibi ahamiyatsiz.
  useEffect(() => {
    const pending = debouncer.current;
    return () => {
      pending.flushPending();
    };
  }, [documentId]);

  // 3) Saqlanmagan o'zgarish bilan sahifadan chiqish — ogohlantirish.
  useEffect(() => {
    if (state === "idle" || state === "saved") return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [state]);

  return { state, issues };
}
