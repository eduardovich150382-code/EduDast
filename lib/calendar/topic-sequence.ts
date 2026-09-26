/**
 * Mavzu daraxtini global ketma-ketlikka yoyish — SOF modul: bazaga ham,
 * kalendarga ham bormaydi.
 *
 * NEGA KERAK: `Topic.order` global tartib EMAS, u OTA ICHIDAGI tartib.
 * `fixtures/fizika-7-namuna.csv` da ildiz bo'limlar `order` 1,2 va har
 * bo'lim ichidagi mavzular yana 1,2 — ya'ni bitta sinfda `order = 1`
 * uch marta uchraydi. Shuning uchun `placement.ts` da mavzularni
 * `order` bo'yicha oddiy `sort` qilish jimgina noto'g'ri reja beradi.
 *
 * `PlacementInput["topics"]` da `parentId` yo'q (07-sessiya spekida shakl
 * qotirib qo'yilgan), demak daraxtni `placement.ts` ko'ra olmaydi — yoyish
 * ALOHIDA modul bo'lishi shart.
 *
 * Tartib `app/[locale]/admin/mavzular/page.tsx` dagi
 * `[{ order: "asc" }, { slug: "asc" }]` bilan AYNAN bir xil: aks holda
 * admin ko'rgan tartib va o'qituvchi ko'rgan reja bir-biriga zid bo'lardi.
 */

export type TopicTreeNode = {
  id: string;
  /** `null` — ildiz tugun (bo'lim). */
  parentId: string | null;
  order: number;
  slug: string;
  quarter?: number | null;
  hoursPlan?: number | null;
};

/** Natija aynan `PlacementInput["topics"]` shakli. */
export type SequencedTopic = {
  id: string;
  quarter: number | null;
  /** 1..N — global, takrorlanmaydigan ketma-ketlik. */
  order: number;
  hoursPlan: number | null;
};

/** CSV'da `order` takrorlanadi, shuning uchun `slug` ikkinchi mezon. */
function compareNodes(a: TopicTreeNode, b: TopicTreeNode): number {
  if (a.order !== b.order) return a.order - b.order;
  // `localeCompare` ATAYLAB emas — u mintaqaga qarab o'zgaradi, slug esa
  // faqat kichik lotin harflari va raqam (csv-schema.ts SLUG_RE).
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * Bolalarni ota bo'yicha guruhlaydi. YETIM tugun (ota kirishda yo'q) ildiz
 * deb qaraladi — chaqiruvchi `grade`/`deletedAt` bo'yicha filtrlaganda
 * shunday bo'ladi va mavzu jimgina yo'qolmasligi kerak.
 */
function groupByParent(nodes: TopicTreeNode[]): Map<string | null, TopicTreeNode[]> {
  const ids = new Set(nodes.map((node) => node.id));
  const groups = new Map<string | null, TopicTreeNode[]>();

  for (const node of nodes) {
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const bucket = groups.get(key);
    if (bucket) bucket.push(node);
    else groups.set(key, [node]);
  }

  for (const bucket of groups.values()) bucket.sort(compareNodes);
  return groups;
}

/**
 * Preorder DFS. Bolasi bor tugun — BO'LIM: ichiga kiriladi, o'zi
 * chiqarilmaydi (bo'lim soati = bolalari yig'indisi, fixture'da bo'lim
 * `hours_plan` i bo'sh).
 *
 * `quarter` MEROS bo'ladi: real CSV'da chorak bo'lim qatorida to'ldiriladi,
 * har bargda emas. Bargdagi o'z qiymati bo'limdan ustun.
 *
 * `visited` — sikldan himoya. `csv-schema.ts` import paytida siklni rad
 * etadi, lekin bazada validatsiyadan oldingi qator turishi mumkin, va sikl
 * bu yerda cheksiz rekursiyaga aylanardi.
 *
 * `forceEmit` — faqat ikkinchi yurish (siklda qolganlar) uchun. Siklda HAR
 * tugunning bolasi bor, ya'ni hammasi "bo'lim" deb hisoblanib natija bo'sh
 * qolardi. Bu yerda mavzuni yo'qotish buzuq tartibdan ham yomonroq.
 */
function walk(
  startNodes: TopicTreeNode[],
  groups: Map<string | null, TopicTreeNode[]>,
  visited: Set<string>,
  out: SequencedTopic[],
  forceEmit = false,
): void {
  const stack: { node: TopicTreeNode; inherited: number | null }[] = [];
  for (let i = startNodes.length - 1; i >= 0; i -= 1) {
    const node = startNodes[i];
    if (node) stack.push({ node, inherited: null });
  }

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const { node, inherited } = entry;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const quarter = node.quarter ?? inherited;
    const children = groups.get(node.id) ?? [];

    if (children.length === 0 || forceEmit) {
      out.push({
        id: node.id,
        quarter,
        order: out.length + 1,
        hoursPlan: node.hoursPlan ?? null,
      });
    }

    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child) stack.push({ node: child, inherited: quarter });
    }
  }
}

/**
 * Daraxtni `order: 1..N` global ketma-ketlikka yoyadi.
 *
 * Siklda qolgan tugunlar (birinchi yurishda umuman ko'rilmaganlar) yo'qolib
 * ketmaydi: ular pseudo-ildiz sifatida qayta yuritiladi.
 */
export function flattenTopicTree(nodes: TopicTreeNode[]): SequencedTopic[] {
  const groups = groupByParent(nodes);
  const visited = new Set<string>();
  const out: SequencedTopic[] = [];

  walk(groups.get(null) ?? [], groups, visited, out);

  const leftover = nodes.filter((node) => !visited.has(node.id)).sort(compareNodes);
  if (leftover.length > 0) walk(leftover, groups, visited, out, true);

  return out;
}
