"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTopic, updateTopic } from "@/server/admin-actions";

/**
 * Daraxtdagi bitta tugun: ko'rinishi va tahrirlash formasi.
 *
 * Forma faqat kerak bo'lganda ochiladi — 100+ mavzuli daraxtda hamma
 * forma bir vaqtda render bo'lsa sahifa og'irlashadi.
 *
 * `objectives` va `keywords` — bitta matn maydonida "|" bilan (CSV bilan
 * bir xil format, docs/curriculum-csv.md), shunda import qilingan ma'lumot
 * qanday ko'rinsa shunday tahrirlanadi.
 */

export type TopicNodeData = {
  id: string;
  slug: string;
  titleUz: string;
  titleUzCyrl: string;
  titleRu: string;
  order: number;
  hoursPlan: number | null;
  objectives: string[];
  keywords: string[];
  childCount: number;
};

const ERRORS: Record<string, string> = {
  invalid: "Ma'lumot noto'g'ri — maydonlarni tekshiring.",
  topilmadi: "Mavzu topilmadi (boshqa joyda o'chirilgan bo'lishi mumkin).",
  "bolasi-bor": "Bu tugunda bola mavzular bor — avval ularni o'chiring.",
};

function splitList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function TopicNode({ topic, depth }: { topic: TopicNodeData; depth: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    titleUz: topic.titleUz,
    titleUzCyrl: topic.titleUzCyrl,
    titleRu: topic.titleRu,
    order: String(topic.order),
    hoursPlan: topic.hoursPlan === null ? "" : String(topic.hoursPlan),
    objectives: topic.objectives.join(" | "),
    keywords: topic.keywords.join(" | "),
  });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value })),
  });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTopic({
        id: topic.id,
        titleUz: form.titleUz,
        titleUzCyrl: form.titleUzCyrl,
        titleRu: form.titleRu,
        order: Number(form.order),
        hoursPlan: form.hoursPlan.trim() === "" ? null : Number(form.hoursPlan),
        objectives: splitList(form.objectives),
        keywords: splitList(form.keywords),
      });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(ERRORS[result.error] ?? ERRORS.invalid!);
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTopic({ id: topic.id });
      if (result.ok) router.refresh();
      else setError(ERRORS[result.error] ?? ERRORS.invalid!);
    });
  }

  return (
    <li style={{ paddingInlineStart: `${depth * 20}px` }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line py-2">
        <span className="text-sm text-ink">{topic.titleUz}</span>
        <span className="font-mono text-xs text-ink-2">{topic.slug}</span>
        <span className="text-xs text-ink-2">tartib: {topic.order}</span>
        {topic.hoursPlan !== null && (
          <span className="text-xs text-ink-2">{topic.hoursPlan} soat</span>
        )}
        <div className="ms-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Tahrirlash"
            disabled={pending}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? (
              <X className="size-4" strokeWidth={1.5} />
            ) : (
              <Pencil className="size-4" strokeWidth={1.5} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="O'chirish"
            disabled={pending || topic.childCount > 0}
            title={topic.childCount > 0 ? "Bolasi bor — o'chirib bo'lmaydi" : "O'chirish"}
            onClick={remove}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {error && <p className="py-1 text-xs text-warn">{error}</p>}

      {editing && (
        <div className="my-2 grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-2">
          <Label text="Sarlavha (lotin)">
            <Input {...field("titleUz")} />
          </Label>
          <Label text="Sarlavha (kirill)">
            <Input {...field("titleUzCyrl")} />
          </Label>
          <Label text="Sarlavha (rus)">
            <Input {...field("titleRu")} />
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Label text="Tartib">
              <Input inputMode="numeric" {...field("order")} />
            </Label>
            <Label text="Soat (bo'sh — yo'q)">
              <Input inputMode="numeric" {...field("hoursPlan")} />
            </Label>
          </div>
          <Label text="Maqsadlar (| bilan)" className="sm:col-span-2">
            <Input {...field("objectives")} />
          </Label>
          <Label text="Kalit so'zlar (| bilan)" className="sm:col-span-2">
            <Input {...field("keywords")} />
          </Label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={pending} onClick={save}>
              Saqlash
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Label({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-2 ${className ?? ""}`}>
      {text}
      {children}
    </label>
  );
}
