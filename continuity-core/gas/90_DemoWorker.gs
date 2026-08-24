/** Python Workerと同じ契約のダミー結果をGAS内で生成・検証する。 */

function demoWorkerWaitHitl_() {
  const update = {
    job_id: HIMAWARI.demo.jobId,
    user_id: HIMAWARI.demo.userId,
    job_type: HIMAWARI.demo.jobType,
    status: HIMAWARI.jobStatus.WAIT_HITL,
    progress: 82,
    completed_steps: ['シート構成の確認', '列名の正規化', '空行の整理'],
    pending_questions: [
      {
        question_id: 'Q1',
        text: '商品コードが重複した場合、更新日の新しい方を採用しますか？',
        reason: '重複した商品コードの採用基準は業務判断が必要なためです。',
        impact: '重複している商品コードの行に影響します。',
        options: [
          {option_id: 'Q1_NEWEST', label: '更新日の新しい方'},
          {option_id: 'Q1_ORIGINAL', label: '元ファイルを優先'}
        ],
        recommended_option_id: 'Q1_NEWEST'
      },
      {
        question_id: 'Q2',
        text: '空欄の担当部署は「未設定」として残しますか？',
        reason: '空欄を確定値へ変える権限がWorkerにはないためです。',
        impact: '担当部署が空欄の行に影響します。',
        options: [
          {option_id: 'Q2_UNSET', label: '未設定として残す'},
          {option_id: 'Q2_REVIEW', label: '該当行を確認対象にする'}
        ],
        recommended_option_id: 'Q2_REVIEW'
      }
    ],
    next_action: 'WAIT_FOR_USER',
    output_refs: [],
    event_id: 'evt_worker_wait_hitl_001',
    updated_at: formatTokyo_(now_())
  };
  validateWorkerUpdate_(update);
  return update;
}

function demoWorkerDone_(answers) {
  if (answers.Q1 !== 'Q1_NEWEST' || answers.Q2 !== 'Q2_REVIEW') {
    throw new Error('デモ回答が正規契約と異なります。');
  }
  const update = {
    job_id: HIMAWARI.demo.jobId,
    user_id: HIMAWARI.demo.userId,
    job_type: HIMAWARI.demo.jobType,
    status: HIMAWARI.jobStatus.DONE,
    progress: 100,
    completed_steps: ['シート構成の確認', '列名の正規化', '空行の整理', 'HITL回答の反映', '改訂版の生成'],
    pending_questions: [],
    next_action: 'DELIVER',
    output_refs: [HIMAWARI.demo.outputRef],
    event_id: 'evt_worker_done_001',
    updated_at: formatTokyo_(now_())
  };
  validateWorkerUpdate_(update);
  return update;
}

function validateWorkerUpdate_(update) {
  if (update.job_id !== HIMAWARI.demo.jobId || update.user_id !== HIMAWARI.demo.userId) {
    throw new Error('Worker結果のJOBまたはUSERが一致しません。');
  }
  if (update.progress < 0 || update.progress > 100) throw new Error('Worker進捗が範囲外です。');
  if (update.status === HIMAWARI.jobStatus.WAIT_HITL && update.pending_questions.length !== 2) {
    throw new Error('WAIT_HITLはちょうど2問必要です。');
  }
  if (update.status === HIMAWARI.jobStatus.DONE && (update.progress !== 100 || update.output_refs.length < 1)) {
    throw new Error('DONEは100%と成果物参照が必要です。');
  }
  return true;
}
