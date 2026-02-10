export const readingDictionary: Record<string, string> = {
    進路授業: "しんろじゅぎょう",
    学問入門講座: "がくもんにゅうもんこうざ",
    小論文: "しょうろんぶん",
    討論対策: "とうろんたいさく",
    書類: "しょるい",
    面接: "めんせつ",
    講座: "こうざ",
    授業: "じゅぎょう",
    年: "ねん",
    就職: "しゅうしょく",
    進学: "しんがく",
    試験対策: "しけんたいさく",
    応用: "おうよう",
    入門: "にゅうもん",
    活動: "かつどう",
    隔週: "かくしゅう",
    基礎: "きそ",
    理科: "りか",
    文科: "ぶんか",
    教養: "きょうよう",
    数学: "すうがく",
    国語: "こくご",
    統計: "とうけい",
    情報: "じょうほう",
    英語: "えいご",
    検定: "けんてい",
    級: "きゅう",
    対策: "たいさく",
    外部連携: "がいぶれんけい",
    価値創造: "かちそうぞう",
    課題解決: "かだいかいけつ",
};

export function getReadingWithFallback(text: string): string {
    const normalized = text.normalize("NFKC").trim();

    if (readingDictionary[normalized]) {
        return readingDictionary[normalized];
    }

    for (const [key, value] of Object.entries(readingDictionary)) {
        if (normalized.includes(key)) {
            return normalized.replace(key, value);
        }
    }

    return normalized;
}
