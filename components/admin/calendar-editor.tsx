"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UZ_REGION_CODES } from "@/lib/uz-regions";
import {
  deleteHoliday,
  saveAcademicYear,
  saveHoliday,
  saveQuarters,
} from "@/server/calendar-actions";

/**
 * O'quv yili kalendarini tahrirlash oroli.
 *
 * Sana kiritish — oddiy `<input type="date">`: brauzerning o'zi kalendar
 * ko'rsatadi va `YYYY-MM-DD` beradi, ya'ni `shadcn add calendar` (va uning
 * date-fns bog'liqligi) kerak emas (CLAUDE.md: sababsiz paket qo'shilmaydi).
 *
 * `router.refresh()` — `revalidatePath` ga QO'SHIMCHA: jadvallar server
 * komponentda render bo'ladi (`components/admin/credit-grant.tsx` naqshi).
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno). Dizayn
 * tokenlari qoidasi esa to'liq amal qiladi.
 */

const ERRORS: Record<string, string> = {
  invalid: "Maydonlar to'liq va to'g'ri emas.",
  topilmadi: "Topilmadi (o'chirilgan bo'lishi mumkin).",
  sana: "Sanalar mantiqan to'g'ri emas: chegaradan chiqqan yoki choraklar kesishgan.",
  band: "Bu nomli o'quv yili allaqachon bor.",
  xato: "Saqlanmadi, qaytadan urinib ko'ring.",
};

export type YearData = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
};

export type QuarterData = { number: number; startsOn: string; endsOn: string };

export type HolidayData = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  scope: "GLOBAL" | "REGION";
  region: string | null;
};

const EMPTY_QUARTERS: QuarterData[] = [1, 2, 3, 4].map((number) => ({
  number,
  startsOn: "",
  endsOn: "",
}));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-2">
      {label}
      {children}
    </label>
  );
}

const selectClass = "h-9 rounded-lg border border-line bg-paper px-2 text-sm text-ink";

export function CalendarEditor({
  year,
  quarters,
  holidays,
}: {
  year: YearData | null;
  quarters: QuarterData[];
  holidays: HolidayData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState(year?.label ?? "");
  const [startsOn, setStartsOn] = useState(year?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(year?.endsOn ?? "");
  const [isActive, setIsActive] = useState(year?.isActive ?? true);

  const [rows, setRows] = useState<QuarterData[]>(
    quarters.length > 0
      ? EMPTY_QUARTERS.map((empty) => quarters.find((q) => q.number === empty.number) ?? empty)
      : EMPTY_QUARTERS,
  );

  const [newHoliday, setNewHoliday] = useState({
    label: "",
    startsOn: "",
    endsOn: "",
    scope: "GLOBAL" as "GLOBAL" | "REGION",
    region: "" as string,
  });

  /** Har action bir xil yo'l bilan yuritiladi: xatoni tozala, yugur, yangila. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(ERRORS[result.error ?? "xato"] ?? ERRORS.xato!);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-md border border-line bg-paper px-4 py-3">
        <h3 className="text-sm font-medium text-ink">O&apos;quv yili</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nomi">
            <Input
              value={label}
              disabled={pending}
              placeholder="2026–2027"
              className="w-36"
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Field label="Boshlanishi">
            <Input
              type="date"
              value={startsOn}
              disabled={pending}
              className="w-40"
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </Field>
          <Field label="Tugashi">
            <Input
              type="date"
              value={endsOn}
              disabled={pending}
              className="w-40"
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isActive}
              disabled={pending}
              className="size-4 accent-accent"
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Faol yil
          </label>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                saveAcademicYear({ id: year?.id, label, startsOn, endsOn, isActive }),
              )
            }
          >
            Saqlash
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-paper px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-ink">Choraklar</h3>
          <p className="text-xs text-ink-2">
            Choraklar kesishmasligi va yil chegarasida bo&apos;lishi kerak. Kuz/qish
            ta&apos;tilini ta&apos;tillar ro&apos;yxatiga qo&apos;shish SHART EMAS — u
            shunchaki choraklar orasidagi bo&apos;shliq.
          </p>
        </div>
        {year === null ? (
          <p className="text-sm text-ink-2">Avval o&apos;quv yilini saqlang.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <div key={row.number} className="flex flex-wrap items-end gap-3">
                  <span className="pb-2 text-sm text-ink">{row.number}-chorak</span>
                  <Field label="Boshlanishi">
                    <Input
                      type="date"
                      value={row.startsOn}
                      disabled={pending}
                      className="w-40"
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((item, position) =>
                            position === index
                              ? { ...item, startsOn: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Tugashi">
                    <Input
                      type="date"
                      value={row.endsOn}
                      disabled={pending}
                      className="w-40"
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((item, position) =>
                            position === index ? { ...item, endsOn: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
            <div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    saveQuarters({
                      academicYearId: year.id,
                      // To'liq to'ldirilmagan chorak yuborilmaydi — Zod uni
                      // "invalid" deb rad etardi va admin qaysi qator ayb
                      // ekanini bilmasdi.
                      quarters: rows.filter((row) => row.startsOn !== "" && row.endsOn !== ""),
                    }),
                  )
                }
              >
                Choraklarni saqlash
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-paper px-4 py-3">
        <h3 className="text-sm font-medium text-ink">Ta&apos;til va bayramlar</h3>
        {year === null ? (
          <p className="text-sm text-ink-2">Avval o&apos;quv yilini saqlang.</p>
        ) : (
          <>
            {holidays.length === 0 ? (
              <p className="text-sm text-ink-2">Hozircha ta&apos;til kiritilmagan.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-ink-2">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nomi</th>
                      <th className="px-3 py-2 font-medium">Boshlanishi</th>
                      <th className="px-3 py-2 font-medium">Tugashi</th>
                      <th className="px-3 py-2 font-medium">Qamrov</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.map((holiday) => (
                      <tr key={holiday.id} className="border-t border-line">
                        <td className="px-3 py-2 text-ink">{holiday.label}</td>
                        <td className="px-3 py-2 text-ink-2">{holiday.startsOn}</td>
                        <td className="px-3 py-2 text-ink-2">{holiday.endsOn}</td>
                        <td className="px-3 py-2 text-ink-2">
                          {holiday.scope === "GLOBAL" ? "Butun mamlakat" : holiday.region}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${holiday.label} ni o'chirish`}
                            disabled={pending}
                            onClick={() => run(() => deleteHoliday({ id: holiday.id }))}
                          >
                            <Trash2 className="size-4" strokeWidth={1.5} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Nomi">
                <Input
                  value={newHoliday.label}
                  disabled={pending}
                  placeholder="Navro'z"
                  className="w-40"
                  onChange={(event) =>
                    setNewHoliday((previous) => ({ ...previous, label: event.target.value }))
                  }
                />
              </Field>
              <Field label="Boshlanishi">
                <Input
                  type="date"
                  value={newHoliday.startsOn}
                  disabled={pending}
                  className="w-40"
                  onChange={(event) =>
                    setNewHoliday((previous) => ({ ...previous, startsOn: event.target.value }))
                  }
                />
              </Field>
              <Field label="Tugashi">
                <Input
                  type="date"
                  value={newHoliday.endsOn}
                  disabled={pending}
                  className="w-40"
                  onChange={(event) =>
                    setNewHoliday((previous) => ({ ...previous, endsOn: event.target.value }))
                  }
                />
              </Field>
              <Field label="Qamrov">
                <select
                  value={newHoliday.scope}
                  disabled={pending}
                  className={selectClass}
                  onChange={(event) =>
                    setNewHoliday((previous) => ({
                      ...previous,
                      scope: event.target.value === "REGION" ? "REGION" : "GLOBAL",
                      region: "",
                    }))
                  }
                >
                  <option value="GLOBAL">Butun mamlakat</option>
                  <option value="REGION">Bitta viloyat</option>
                </select>
              </Field>
              {newHoliday.scope === "REGION" && (
                <Field label="Viloyat">
                  <select
                    value={newHoliday.region}
                    disabled={pending}
                    className={selectClass}
                    onChange={(event) =>
                      setNewHoliday((previous) => ({ ...previous, region: event.target.value }))
                    }
                  >
                    <option value="">— tanlang —</option>
                    {UZ_REGION_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await saveHoliday({
                      academicYearId: year.id,
                      label: newHoliday.label,
                      startsOn: newHoliday.startsOn,
                      endsOn: newHoliday.endsOn,
                      scope: newHoliday.scope,
                      // GLOBAL uchun `null` MAJBURIY (server ikki tomonlama
                      // tekshiradi), REGION uchun bo'sh satr `null` ga
                      // aylanadi va Zod uni rad etadi — ya'ni "viloyat
                      // tanlanmagan" jimgina o'tib ketmaydi.
                      region: newHoliday.scope === "REGION" ? newHoliday.region || null : null,
                    });
                    if (result.ok) {
                      setNewHoliday({
                        label: "",
                        startsOn: "",
                        endsOn: "",
                        scope: "GLOBAL",
                        region: "",
                      });
                    }
                    return result;
                  })
                }
              >
                <Plus className="size-4" strokeWidth={1.5} />
                Qo&apos;shish
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
