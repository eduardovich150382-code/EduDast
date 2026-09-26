/**
 * Kredit qatlamining xatolari.
 *
 * Uslub `lib/llm/errors.ts` dan olingan: bitta baza klass + `kind`
 * diskriminanti + `isCreditError()` qorovuli. Sabab — chaqiruvchi
 * (`server/credit-actions.ts`) xatoni `instanceof` bilan tekshirmasdan,
 * `kind` bo'yicha qisqa kodga aylantira oladi va yangi tur qo'shilganda
 * TypeScript uni `switch` da eslatadi.
 *
 * QATLAMLAR CHEGARASI: bu klasslar KUTUBXONA qatlamidan tashlanadi. Server
 * action'lar ularni hech qachon tashqariga chiqarmaydi — `{ ok: false, error }`
 * union'iga aylantiradi (`server/admin-actions.ts` konvensiyasi).
 */

export type CreditErrorKind =
  /** Mavjud balans (`creditBalance - creditsHeld`) yetmadi — hold rad etildi. */
  | "insufficient"
  /** Hold yo'q yoki allaqachon ishlatilgan — IKKI MARTA YECHISH urinishi. */
  | "hold_mismatch"
  /** Hujjat kutilgan holatda emas (masalan allaqachon DONE). */
  | "document_state"
  /** Foydalanuvchi topilmadi yoki o'chirilgan. */
  | "user_not_found"
  /** Chaqiruvchi xatosi: butun yoki musbat bo'lmagan miqdor. */
  | "invalid_amount";

export type CreditErrorContext = {
  userId?: string;
  documentId?: string;
  amount?: number;
  cause?: unknown;
};

export class CreditError extends Error {
  readonly kind: CreditErrorKind;
  readonly userId?: string;
  readonly documentId?: string;
  readonly amount?: number;

  constructor(kind: CreditErrorKind, message: string, ctx: CreditErrorContext = {}) {
    super(message, { cause: ctx.cause });
    this.name = "CreditError";
    this.kind = kind;
    this.userId = ctx.userId;
    this.documentId = ctx.documentId;
    this.amount = ctx.amount;
  }
}

/**
 * Mavjud balans yetmadi — `hold()` ning YAGONA kutilgan xatosi.
 *
 * Bu nosozlik emas, normal holat: foydalanuvchi krediti tugagan. Sentry'ga
 * chiqarilmaydi, foydalanuvchiga "kredit sotib oling" ekrani ko'rsatiladi.
 */
export class InsufficientCredits extends CreditError {
  constructor(ctx: CreditErrorContext) {
    super("insufficient", `Kredit yetarli emas (kerak: ${ctx.amount ?? "?"}).`, ctx);
    this.name = "InsufficientCredits";
  }
}

/**
 * Band qilingan kredit topilmadi.
 *
 * Bu "balans yetmadi" EMAS — bu TIZIM xatosi: `charge()` yoki `release()`
 * o'zi band qilmagan kreditni yechmoqchi, ya'ni `hold → charge | release`
 * oqimi buzilgan yoki funksiya ikkinchi marta chaqirilgan. Jimgina
 * yutilmasligi kerak: Sentry'ga chiqishi SHART, chunki bu pul hisobidagi
 * nomuvofiqlikning yagona ogohlantirishi.
 */
export class HoldMismatch extends CreditError {
  constructor(ctx: CreditErrorContext) {
    super("hold_mismatch", "Band qilingan kredit topilmadi (ikki marta yechish?).", ctx);
    this.name = "HoldMismatch";
  }
}

/**
 * `charge()` / `release()` ning hujjat darvozasi.
 *
 * `updateMany({ where: { status: ... } }).count !== 1` — hujjat kutilgan
 * holatda emas (allaqachon DONE yoki FAILED). Tranzaksiya rollback bo'ladi,
 * ya'ni `CreditTx` ham, balans ham qimirlamaydi. AYNAN shu juftlik — pulni
 * yechish va statusni o'zgartirish bitta tranzaksiyada — ikki marta yechishni
 * struktura darajasida imkonsiz qiladi.
 */
export class DocumentNotRunning extends CreditError {
  constructor(ctx: CreditErrorContext) {
    super("document_state", "Hujjat kutilgan holatda emas.", ctx);
    this.name = "DocumentNotRunning";
  }
}

/** Kredit qo'shilayotgan foydalanuvchi topilmadi yoki soft-delete qilingan. */
export class CreditUserNotFound extends CreditError {
  constructor(ctx: CreditErrorContext) {
    super("user_not_found", "Foydalanuvchi topilmadi.", ctx);
    this.name = "CreditUserNotFound";
  }
}

export function isCreditError(e: unknown): e is CreditError {
  return e instanceof CreditError;
}
