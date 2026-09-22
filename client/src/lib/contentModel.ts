export type Grade = { grade: number; title: string; visible: boolean };
export type Topic = {
  id: string;
  title: string;
  grade: number;
  order: number;
  visible: boolean;
};
type TaskEntry = {
  task_id: string;
  topicId: string;
  visible: boolean;
  featured: boolean;
  order: number;
  title: string;
};

export function publicTopics(topics: Topic[], grades: Grade[]) {
  return topics
    .filter(
      topic =>
        topic.visible &&
        grades.some(grade => grade.grade === topic.grade && grade.visible)
    )
    .sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hant")
    );
}

export function publicTasks<T extends TaskEntry>(tasks: T[], topics: Topic[]) {
  return tasks
    .flatMap(({ task_id, ...task }) => {
      const topic = topics.find(item => item.id === task.topicId);
      if (!topic || !task.visible) return [];
      return [{ ...task, id: task_id, grade: topic.grade, topic: topic.title }];
    })
    .sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hant")
    );
}

export function filterTasks<
  T extends { topicId: string; grade: number; featured: boolean },
>(tasks: T[], grade: number | null, topic: string | null, showAll: boolean) {
  return tasks.filter(task =>
    topic
      ? task.topicId === topic
      : grade !== null
        ? task.grade === grade
        : showAll || task.featured
  );
}
