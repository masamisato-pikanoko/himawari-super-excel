/** Drive上の社員A/Bだけを使う、原本非破壊の統合試験棚札。C/D/Eは参照しない。 */

const HIMAWARI_AB_TEST = Object.freeze([
  Object.freeze({label:'社員A',fileId:'1Os5ia8Ifjw9GZytvuB0AR08YbUuVz9_p',userId:'EMPLOYEE_A'}),
  Object.freeze({label:'社員B',fileId:'15twrj2lmeYGmhoaAnBDNgCW7iAFRJ6T5',userId:'EMPLOYEE_B'})
]);

function mazukore_phase2_shain_AB_wo_test_uketsuke() {
  mazukore_phase2_dev_uketsuke_wo_tsukuru();
  return HIMAWARI_AB_TEST.map(function(item) {
    return {label:item.label,result:mazukore_phase2_file_wo_uketsukeru(item.fileId,item.userId)};
  });
}

function tsugikore_phase2_shain_AB_no_yakan_kekka_wo_yomu() {
  return HIMAWARI_AB_TEST.map(function(item) {
    const job = phase2FindJobBySourceFileId_(item.fileId);
    const update = phase2ReadJobArtifactJson_(job.JOB_ID, 'worker-update.wait.v1.json');
    const result = tsugikore_phase2_worker_kekka_wo_uketsukeru(update);
    return {label:item.label,job_id:job.JOB_ID,result:result};
  });
}

function tsugikore_phase2_shain_AB_no_asa_no_2mon_wo_tsukuru() {
  return HIMAWARI_AB_TEST.map(function(item) {
    const job = phase2FindJobBySourceFileId_(item.fileId);
    return {label:item.label,result:tsugikore_phase2_asa_no_houkoku_wo_tsukuru(job.JOB_ID)};
  });
}

function tsugikore_phase2_shain_AB_no_test_kaitou_wo_ireru() {
  return HIMAWARI_AB_TEST.map(function(item) {
    return withJobLock_(function() {
      const job = phase2FindJobBySourceFileId_(item.fileId);
      if (job.STATUS !== HIMAWARI.jobStatus.WAIT_HITL) throw new Error(item.label + 'は2問回答待ちではありません。');
      const rows = getHitlRows_(job.CURRENT_HITL_ID);
      const answers = rows.map(function(row) {
        const contract = phase2SafeJsonParse_(row.OPTIONS_JSON, 'HITL option contract');
        const option = contract.options.filter(function(candidate) { return candidate.option_id === contract.recommended_option_id; })[0];
        return {question_id:row.QUESTION_ID,option_id:option.option_id,option_label:option.label,comment:'A/B統合試験の推奨回答'};
      });
      submitHitlAnswers_(job.JOB_ID, job.USER_ID, 1, answers);
      const resume = phase2RequestSameJobResume_(job.JOB_ID);
      return {label:item.label,job_id:job.JOB_ID,resume:resume,test_answers:true};
    });
  });
}

function saigokore_phase2_shain_AB_no_kansei_kekka_wo_yomu() {
  return HIMAWARI_AB_TEST.map(function(item) {
    const job = phase2FindJobBySourceFileId_(item.fileId);
    const update = phase2ReadJobArtifactJson_(job.JOB_ID, 'worker-update.done.v2.json');
    const result = tsugikore_phase2_worker_kekka_wo_uketsukeru(update);
    return {label:item.label,job_id:job.JOB_ID,result:result};
  });
}

function phase2FindJobBySourceFileId_(fileId) {
  const events = readObjects_('EVENTS').filter(function(row) { return row.EVENT_TYPE === HIMAWARI.eventType.JOB_RECEIVED; });
  for (let index = 0; index < events.length; index += 1) {
    const payload = phase2SafeJsonParse_(events[index].PAYLOAD_JSON, 'JOB_RECEIVED payload');
    if (payload.source_file_id === fileId) {
      const job = getJob_(events[index].JOB_ID);
      if (job) return job;
    }
  }
  throw new Error('社員A/Bの受付JOBがありません: ' + fileId);
}

function phase2ReadJobArtifactJson_(jobId, fileName) {
  const metadata = phase2JobMetadata_(jobId);
  const files = DriveApp.getFolderById(metadata.artifacts_folder_id).getFilesByName(fileName);
  if (!files.hasNext()) throw new Error('Worker成果JSONがありません: ' + jobId + '/' + fileName);
  const file = files.next();
  if (files.hasNext()) throw new Error('Worker成果JSONが重複しています: ' + jobId + '/' + fileName);
  return phase2SafeJsonParse_(file.getBlob().getDataAsString('UTF-8'), fileName);
}
