import { rulesAssessmentEnabled } from "@/lib/localAssessment";
import { useEffect, useState } from "react";
import { doc } from "firebase/firestore";
import {subscribeRewardDocument} from '@/lib/rewardSubscriptions';
import { useOptionalStudentAccount } from "@/contexts/StudentAccount";
import { getQuestions } from "@/lib/assessment";
import { canPlayGrade } from "@/lib/gradeAccess";
import { gameForTask } from "@/lib/games/registry";
import { db } from "@/lib/firebase";
import type { HistoryTask } from "@/lib/historyQuest";
import type { CoinRule } from "@/lib/coinModel";
import {
  coinRewardHint,
  possibleAssessmentScores,
  type CoinRewardHint,
} from "@/lib/coinRewardHint";

function rewardSource(task: HistoryTask) {
  if (gameForTask(task.id)) return "game" as const;
  if (task.type !== "game" && getQuestions(task).length)
    return "assessment" as const;
  // Reading alone and unconnected games have no existing settlement path.
  return null;
}

export function useTaskCoinRewards(
  tasks: HistoryTask[],
  preview = false,
  previewRules?: Record<string, CoinRule>
): Record<string, CoinRewardHint | null> {
  const account = useOptionalStudentAccount();
  const readable = tasks.filter(
    task => rewardSource(task) && (preview || canPlayGrade(account, task.grade))
  );
  const taskIds = JSON.stringify(readable.map(task => task.id).sort());
  const scope = JSON.stringify([
    account?.user.uid,
    account?.studentId,
    account?.profile?.className,
    account?.testingAccount,
    readable.map(task=>[task.id,task.assessmentVersion,gameForTask(task.id)?.mazeVersion]),
    taskIds,
  ]);
  const [state, setState] = useState<{
    scope: string;
    ready: boolean;
    rules: Record<string, CoinRule | undefined>;
    enabled: Record<string, boolean>;
    earned: Record<string, number>;
  }>({ scope: "", ready: false, rules: {}, enabled: {}, earned: {} });

  useEffect(() => {
    if (preview || !account || !readable.length) return;
    setState({ scope, ready: false, rules: {}, enabled: {}, earned: {} });
    let active = true;
    const onSnapshot:typeof import('firebase/firestore').onSnapshot=((ref:any,_options:any,next:any,error:any)=>subscribeRewardDocument(ref,JSON.stringify([account.user.uid,account.studentId,account.profile?.className,account.testingAccount]),next,error)) as any;
    const update = (id: string, rule?: CoinRule) => {
      if (active)
        setState(previous =>
          previous.scope === scope
            ? { ...previous, rules: { ...previous.rules, [id]: rule } }
            : previous
        );
    };
    const unsubscribe = (JSON.parse(taskIds) as string[]).map(id =>
      onSnapshot(
        doc(db, "coinRules", id),
        { includeMetadataChanges: true },
        snapshot => {
          // Cached settings may have changed or access may have been revoked.
          update(
            id,
            !snapshot.metadata.fromCache && snapshot.exists()
              ? (snapshot.data() as CoinRule)
              : undefined
          );
        },
        () => update(id)
      )
    );
    const confirmed = (snapshot: {
      exists(): boolean;
      metadata: { fromCache: boolean };
    }) => snapshot.exists() && !snapshot.metadata.fromCache;
    unsubscribe.push(
      onSnapshot(
        doc(db, "rewardAutomation", "status"),
        { includeMetadataChanges: true },
        snapshot => {
          if (active)
            setState(previous =>
              previous.scope === scope
                ? {
                    ...previous,
                    ready:
                      confirmed(snapshot) && snapshot.data()?.enabled === true && typeof snapshot.data()?.activatedAt?.toMillis === "function",
                  }
                : previous
            );
        },
        () => {
          if (active) setState(previous => ({ ...previous, ready: false }));
        }
      )
    );
    for (const id of JSON.parse(taskIds) as string[]) {
      const game=gameForTask(id);
      let policyEnabled=false,versionEnabled=game?.rulesProtocol!=='rules-game/1';
      const updateEnabled=()=>{if(active)setState(previous=>previous.scope===scope?{...previous,enabled:{...previous.enabled,[id]:policyEnabled&&versionEnabled}}:previous);};
      if(game?.rulesProtocol==='rules-game/1'&&game.mazeVersion)unsubscribe.push(onSnapshot(doc(db,'gameRulesVersions',game.mazeVersion),{includeMetadataChanges:true},snapshot=>{
        const v=snapshot.data();versionEnabled=confirmed(snapshot)&&v?.enabled===true&&v.protocol==='rules-game/1'&&v.gameId===game.gameId&&v.version===game.version&&v.taskId===id&&typeof v.acceptFrom?.toMillis==='function';updateEnabled();
      },()=>{versionEnabled=false;updateEnabled();}));
      if(!rulesAssessmentEnabled(readable.find(task=>task.id===id)!))unsubscribe.push(
        onSnapshot(
          doc(db, "rewardPolicies", id),
          { includeMetadataChanges: true },
          snapshot => {
            policyEnabled=confirmed(snapshot)&&snapshot.data()?.enabled===true&&snapshot.data()?.source===rewardSource(readable.find(task=>task.id===id)!);updateEnabled();
          },
          () => {
            policyEnabled=false;updateEnabled();
          }
        )
      );
      unsubscribe.push(
        onSnapshot(
          doc(db, "coinAccounts", account.studentId, "entries", id),
          { includeMetadataChanges: true },
          snapshot => {
            if (active)
              setState(previous =>
                previous.scope === scope
                  ? {
                      ...previous,
                      earned: {
                        ...previous.earned,
                        [id]: confirmed(snapshot)
                          ? Number(snapshot.data()?.amount) || 0
                          : 0,
                      },
                    }
                  : previous
              );
          },
          () => {
            if (active)
              setState(previous => ({
                ...previous,
                earned: { ...previous.earned, [id]: 0 },
              }));
          }
        )
      );
    }
    return () => {
      active = false;
      unsubscribe.forEach(stop => stop());
    };
  }, [preview, scope, taskIds]);

  const rules = preview
    ? previewRules || {}
    : state.scope === scope
      ? state.rules
      : {};
  return Object.fromEntries(
    readable.map(task => {
      const earned =
        !preview && state.scope === scope ? state.earned[task.id] : 0;
      if (earned > 0)
        return [
          task.id,
          {
            label: `已獲得 ${earned.toLocaleString("zh-HK")} 探索幣`,
            delivery: "此任務已領取，不會重複發放",
            conditions: [
              "每人每任務只發放一次正數獎勵。",
              "重做、改分及更改設定不會追加或補差額。",
            ],
            tiers: [],
          },
        ];
      const enabled = rulesAssessmentEnabled(task) ? state.scope===scope && state.ready && Boolean(rules[task.id]) : preview
        ? previewRules !== undefined
        : state.scope === scope && state.ready && state.enabled[task.id];
      const source = rewardSource(task);
      const questions = getQuestions(task);
      return [
        task.id,
        enabled
          ? coinRewardHint(
              rules[task.id],
              source,
              questions.some(q => q.type === "short"),
              source === "assessment"
                ? possibleAssessmentScores(questions)
                : undefined
            )
          : null,
      ];
    })
  );
}
