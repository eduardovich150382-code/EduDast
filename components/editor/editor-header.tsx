"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { SaveState } from "@/components/editor/use-autosave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTOSAVE_MS, createDebouncer } from "@/lib/documents/autosave";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { deleteDocument, renameDocument } from "@/server/document-actions";

/**
 * Muharrir sarlavhasi: nom, saqlash holati va o'chirish.
 *
 * O'CHIRISH TASDIG'I IKKI QADAMLI TUGMA, dialog EMAS:
 * `components/ui/dialog.tsx` 11-sessiyada 0 import bilan o'chirilgan va uni
 * qaytarish shu sessiyaning doirasini kengaytirardi. Ikki qadam tasodifiy
 * bosishdan yetarlicha himoya qiladi — nishon o'rni almashadi va matn
 * "Tasdiqlaysizmi?" ga o'zgaradi.
 *
 * Nom o'zgarishi kontent bilan AYNI kutish vaqtida (1.5 s): o'qituvchi
 * uchun ikkisi bitta "saqlanadi" tuyg'usi bo'lishi kerak.
 */
export function EditorHeader({
  documentId,
  title,
  state,
}: {
  documentId: string;
  title: string;
  state: SaveState;
}) {
  const tE = useTranslations("Editor");
  const router = useRouter();
  const [name, setName] = useState(title);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const debouncer = useRef(createDebouncer(AUTOSAVE_MS));

  useEffect(() => {
    if (name === title) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;

    const rename = debouncer.current;
    rename.schedule(() => {
      void renameDocument({ id: documentId, title: trimmed }).then((result) => {
        if (!result.ok) toast.error(tE(`errors.${result.error}`));
      });
    });
    return () => {
      rename.cancelTimer();
    };
  }, [name, title, documentId, tE]);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDocument({ id: documentId });
      if (!result.ok) {
        toast.error(tE(`errors.${result.error}`));
        return;
      }
      router.push("/ish/hujjatlar");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/ish/hujjat/${documentId}`}
          className="flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          {tE("back")}
        </Link>
        <span className="text-xs text-ink-2">{tE(`save.${state}`)}</span>
      </div>

      <Input
        value={name}
        maxLength={200}
        aria-label={tE("rename.label")}
        aria-invalid={name.trim().length === 0}
        className="h-11 font-heading text-base font-semibold"
        onChange={(event) => {
          setName(event.target.value);
        }}
      />

      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="touch" disabled={pending} onClick={handleDelete}>
            <Trash2 className="size-4" strokeWidth={1.5} />
            {tE("delete.confirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="touch"
            disabled={pending}
            onClick={() => {
              setConfirming(false);
            }}
          >
            {tE("delete.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="self-start"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
          {tE("delete.action")}
        </Button>
      )}
    </div>
  );
}
