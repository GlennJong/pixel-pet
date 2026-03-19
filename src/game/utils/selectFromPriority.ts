type TPriorityObject = {
  priority: number;
};

export function selectFromPriority<T extends TPriorityObject>(
  data: T[] | { [key: string]: T },
): T {
  const currentData = !Array.isArray(data) ? Object.values(data) : data;
  const sumPriority = currentData.reduce((a, b) => a + b.priority, 0);
  const randomPoint = sumPriority * Math.random();
  const allActionPoints = currentData.map((item) =>
    Math.abs(item.priority - randomPoint),
  );
  const closestPoint = Math.min(...allActionPoints);

  const candidateIndexes = allActionPoints
    .map((point, index) => (point === closestPoint ? index : -1))
    .filter((index) => index !== -1);

  const randomIdx =
    candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
  return currentData[randomIdx];
}
