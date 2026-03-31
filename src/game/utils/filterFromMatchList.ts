interface FlexibleActionMatches {
  [key: string]: string | string[]; // 鍵是字串，值可以是字串或字串陣列
}

interface GenericActionWithMatches {
  matches: FlexibleActionMatches;
  [key: string]: unknown; // 鍵是字串，值可以是任何型別 (unknown 是 any 的安全替代品)
}

export function filterFromMatchList<
  T extends Record<string, string | number>,
  U extends GenericActionWithMatches,
>(data: T, commandMapList: U[]): U | null {
  let bestMatch: U | null = null;
  let highestMatchScore: number = -1;

  for (const action of commandMapList) {
    let currentMatchScore: number = 0;
    const matches = action.matches;

    let allConditionsMetForAction = true;

    for (const matchKey in matches) {
      if (Object.prototype.hasOwnProperty.call(matches, matchKey)) {
        const matchValue = matches[matchKey];
        const dataValue: string | number | undefined = data[matchKey];

        if (dataValue === undefined) {
          allConditionsMetForAction = false;
          break;
        }
        const dataValueAsString = String(dataValue);

        if (Array.isArray(matchValue)) {
          if (!matchValue.includes(dataValueAsString)) {
            allConditionsMetForAction = false;
            break;
          } else {
            currentMatchScore += 1;
          }
        } else if (typeof matchValue === "string") {
          if (matchValue !== dataValueAsString) {
            allConditionsMetForAction = false;
            break;
          } else {
            currentMatchScore += 2;
          }
        } else {
          allConditionsMetForAction = false;
          break;
        }
      }
    }

    if (allConditionsMetForAction) {
      if (currentMatchScore > highestMatchScore) {
        highestMatchScore = currentMatchScore;
        bestMatch = action;
      }
    }
  }

  return bestMatch;
}
