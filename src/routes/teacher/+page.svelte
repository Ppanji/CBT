<script lang="ts">
  import { onMount, tick } from "svelte";

  // --- Auth ---
  let username = "";
  let password = "";
  let loggedIn = false;

  // --- Subjects & exam selection ---
  const subjects = ["Bahasa Indonesia", "Matematika"];
  let chosenSubject = subjects[0];
  let materialTitle = "";

  // exams / questions
  let exams: Array<{ id: number; title: string }> = [];
  let selectedExamId: number | null = null;
  let selectedExamTitle: string | null = null;
  // pagination state & questions
  let page = 1;
  let limit = 10;
  let total = 0;
  let totalPages = 0;
  let questions: Array<any> = [];

  // --- Rekap (attempts) ---
  // attempts for selected exam
  let attempts: Array<any> = [];
  let attemptsLoading = false;
  let attemptsError: string | null = null;

  // attempt detail modal
  let showAttemptModal = false;
  let attemptDetail: any = null;
  let attemptDetailLoading = false;

  // tab: 'soal' or 'rekap'
  let activeTab: "soal" | "rekap" = "soal";

  // --- Question form state ---
  let qText = "";
  let qType: "pg" | "mcma" | "tf" = "pg";
  let correctAnswer = 0;

  // helper: default opts per tipe
  function getDefaultOpts(type: string) {
    if (type === "tf") {
      return [
        { text: "Benar", is_correct: true },
        { text: "Salah", is_correct: false }
      ];
    }
    // default 4 options for other types
    return [
      { text: "", is_correct: false },
      { text: "", is_correct: false },
      { text: "", is_correct: false },
      { text: "", is_correct: false }
    ];
  }

  // initial opts based on initial qType
  let opts = getDefaultOpts(qType);

  // element ref untuk autofocus
  let questionInput: HTMLTextAreaElement | null = null;

  // --- Toast ---
  let showToast = false;
  let toastMessage = "";
  let toastType: "success" | "error" | "info" = "info";
  let toastTimer: number | null = null;
  function show_toast(msg: string, type: "success" | "error" | "info" = "info", duration = 2500) {
    toastMessage = msg;
    toastType = type;
    showToast = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      showToast = false;
      toastTimer = null;
    }, duration);
  }

  // --- Auth helpers ---
  function checkLogin() {
    if (username === "admin" && password === "4312") {
      localStorage.setItem("teacher_auth", "1");
      loggedIn = true;
      page = 1;
      fetchExams();
      show_toast("Login berhasil", "success");
    } else {
      show_toast("Login gagal", "error");
    }
  }
  function logout() {
    localStorage.removeItem("teacher_auth");
    loggedIn = false;
    show_toast("Logout", "info");
  }

  onMount(() => {
    loggedIn = !!localStorage.getItem("teacher_auth");
    if (loggedIn) fetchExams();
  });

// format ISO/Date ke tampilan lokal Indonesia (WIB)
function formatToWIB(value: string | null | undefined) {
  if (!value) return "-";
  try {
    // terima ISO string atau timestamp; buat Date dari value
    const d = (typeof value === 'string') ? new Date(value) : new Date(String(value));
    // jika invalid date, kembalikan original
    if (Number.isNaN(d.getTime())) return String(value);

    // format: tanggal lengkap + jam (WIB)
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (err) {
    console.error('formatToWIB error', err);
    return String(value);
  }
}

function formatDurationHMS(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || isNaN(Number(seconds))) return "-";
  const secs = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

  // --- Fetch exams & questions ---
  async function fetchExams() {
    try {
      const res = await fetch("/api/exams");
      if (!res.ok) throw new Error("fetch /api/exams failed: " + res.status);
      const data = await res.json();
      exams = Array.isArray(data) ? data : [];
      if (!selectedExamId && exams.length) {
        selectedExamId = exams[0].id;
        selectedExamTitle = exams[0].title;
      } else if (selectedExamId) {
        const found = exams.find((e) => e.id === selectedExamId);
        selectedExamTitle = found ? found.title : selectedExamTitle;
      }
      if (selectedExamId) await loadQuestions(1);
    } catch (e) {
      console.error(e);
      show_toast("Gagal ambil daftar exam", "error");
      exams = [];
    }
  }

  // new paginated loader
  async function loadQuestions(p = 1) {
    if (!selectedExamId) {
      questions = [];
      total = 0;
      totalPages = 0;
      page = 1;
      return;
    }
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/questions?page=${p}&limit=${limit}`);
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const data = await res.json();
      questions = data.items || [];
      total = data.total || 0;
      page = data.page || p;
      totalPages = data.totalPages || 0;
    } catch (e) {
      console.error(e);
      show_toast("Gagal ambil soal", "error");
      questions = [];
      total = 0;
      totalPages = 0;
    }
  }

  // backward-compatible fetchQuestions (calls paginated loader)
  async function fetchQuestions() {
    await loadQuestions(page);
  }

  // --- Create exam ---
  async function createExam() {
    const material = materialTitle.trim();
    if (!material) {
      show_toast("Tulis judul materi terlebih dahulu", "error");
      return;
    }
    const title = `${chosenSubject} - ${material}`;
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: "" })
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        console.error("create exam failed", txt);
        show_toast("Gagal membuat mapel", "error");
        return;
      }
      const created = await res.json();
      selectedExamId = created.id;
      selectedExamTitle = created.title;
      materialTitle = "";
      // reset form opts to match current qType (safe)
      opts = getDefaultOpts(qType);
      await fetchExams();
      show_toast("Mapel dibuat: " + created.title, "success");
      await tick();
      if (questionInput && typeof questionInput.focus === "function") questionInput.focus();
    } catch (e) {
      console.error(e);
      show_toast("Network error saat membuat mapel", "error");
    }
  }

  // --- Options helpers ---
  function addOption() {
    opts = [...opts, { text: "", is_correct: false }];
  }
  function removeOption(i: number) {
    opts = opts.filter((_, idx) => idx !== i);
    if (correctAnswer >= opts.length) correctAnswer = Math.max(0, opts.length - 1);
  }

  // adjust defaults when changing qType only if current opts are empty
  function adjustDefaultOptsIfEmpty() {
    const allEmpty = opts.every((o) => !o.text);
    if (allEmpty) {
      opts = getDefaultOpts(qType);
      correctAnswer = 0;
    }
  }

  // --- Save question ---
  async function saveQuestion() {
    if (!selectedExamId) {
      show_toast("Buat atau pilih mapel dahulu", "error");
      return;
    }
    if (!qText.trim()) {
      show_toast("Isi pertanyaan", "error");
      return;
    }

    const payload = {
      exam_id: selectedExamId,
      text: qText,
      type: qType,
      opts: opts.map((o: any, idx: number) => ({ text: o.text, is_correct: qType === "mcma" ? !!o.is_correct : idx === correctAnswer }))
    };

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const t = await res.text().catch(() => null);
        console.error("save question failed", t);
        show_toast("Gagal menyimpan soal", "error");
        return;
      }
      show_toast("Soal tersimpan", "success");
      // reset form, but keep qType same; defaults depend on qType
      qText = "";
      opts = getDefaultOpts(qType);
      correctAnswer = 0;
      await loadQuestions(1);
      await tick();
      if (questionInput && typeof questionInput.focus === "function") questionInput.focus();
    } catch (e) {
      console.error(e);
      show_toast("Network error saat menyimpan soal", "error");
    }
  }

  // --- Delete question ---
  async function deleteQuestion(id: number) {
    if (!confirm("Hapus soal ini? Tindakan tidak bisa dibatalkan.")) return;
    try {
      const res = await fetch("/api/questions/" + id, { method: "DELETE" });
      if (!res.ok) {
        show_toast("Gagal hapus soal", "error");
        return;
      }
      show_toast("Soal dihapus", "success");
      await loadQuestions(1);
    } catch (e) {
      console.error(e);
      show_toast("Network error saat hapus soal", "error");
    }
  }

  // --- Delete exam (materi) ---
  async function deleteExam() {
    if (!selectedExamId) {
      show_toast("Pilih exam dulu", "error");
      return;
    }
    if (!confirm("Hapus materi (exam) ini beserta semua soalnya? Tindakan ini permanen.")) return;
    try {
      const res = await fetch("/api/exams/" + selectedExamId, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("delete exam failed:", body);
        show_toast("Gagal hapus materi", "error");
        return;
      }
      show_toast("Materi dihapus", "success");
      // reset selection & refresh
      selectedExamId = null;
      selectedExamTitle = null;
      questions = [];
      await fetchExams();
    } catch (e) {
      console.error(e);
      show_toast("Network error saat hapus materi", "error");
    }
  }

  // ---------------- Rekap functions ----------------

  // load attempts for selected exam
  async function loadAttempts() {
    attempts = [];
    attemptsError = null;
    if (!selectedExamId) {
      attemptsError = "Pilih exam dulu untuk lihat rekap.";
      return;
    }
    attemptsLoading = true;
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/attempts`);
      if (!res.ok) throw new Error("fetch attempts failed: " + res.status);
      attempts = await res.json();
    } catch (e: any) {
      console.error(e);
      attemptsError = String(e?.message || e);
    } finally {
      attemptsLoading = false;
    }
  }

  // view attempt detail
  async function viewAttempt(aid: number) {
    attemptDetail = null;
    showAttemptModal = true;
    attemptDetailLoading = true;
    try {
      const res = await fetch(`/api/attempts/${aid}`);
      if (!res.ok) throw new Error("failed to get attempt detail");
      const data = await res.json();
      attemptDetail = data;
    } catch (e) {
      console.error(e);
      attemptDetail = { error: String(e) };
    } finally {
      attemptDetailLoading = false;
    }
  }

  function closeAttemptModal() {
    showAttemptModal = false;
    attemptDetail = null;
  }

  function exportAttemptsCSV() {
    if (!attempts || !attempts.length) {
      show_toast("Tidak ada data untuk di-export", "info");
      return;
    }
    const rows = [
      ["Attempt ID", "Student", "Started At", "Finished At", "Score", "Duration(s)"]
    ];
    for (const a of attempts) {
      rows.push([a.id, a.student_name ?? "", a.started_at ?? "", a.finished_at ?? "", a.score ?? "", a.duration_seconds ?? ""]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exam_${selectedExamId}_attempts.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ensure when exam changes we reload both questions and attempts (the attempts reload only when on rekap tab)
  $: if (selectedExamId) {
    if (activeTab === 'rekap') loadAttempts();
  }

  // When user clicks Rekap tab, load attempts immediately (even if exam didn't change)
  function openRekapTab() {
    activeTab = 'rekap';
    loadAttempts();
  }
</script>

{#if !loggedIn}
  <main style="padding:16px">
    <h1>Login Guru</h1>
    <div style="margin-top:8px;">
      <label>Username <input bind:value={username} /></label>
    </div>
    <div style="margin-top:8px;">
      <label>Password <input type="password" bind:value={password} /></label>
    </div>
    <div style="margin-top:12px;">
      <button on:click={checkLogin}>Login</button>
    </div>
  </main>
{:else}
  <main style="padding:16px; position:relative;">
    <!-- toast -->
    {#if showToast}
      <div style="position:fixed; right:18px; top:18px; z-index:9999; min-width:220px; padding:10px 14px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.12); color:white; font-weight:600;" class={toastType}>
        {#if toastType === "success"}
          <div>✓ {toastMessage}</div>
        {:else if toastType === "error"}
          <div>⚠ {toastMessage}</div>
        {:else}
          <div>• {toastMessage}</div>
        {/if}
      </div>
    {/if}

    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h1 style="margin:0">Teacher — Buat Soal</h1>
        <div style="color:#333; margin-top:6px;">Exam aktif: <strong>{selectedExamTitle ?? (selectedExamId ? "ID " + selectedExamId : "—")}</strong></div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button on:click={logout}>Logout</button>
        <button on:click={deleteExam} title="Hapus seluruh materi & soal">Hapus Materi</button>
      </div>
    </div>

    <section style="margin-top:18px;">
      <h2>Pilih Mata Pelajaran & Buat Materi</h2>

      <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <label>
          Subject:
          <select bind:value={chosenSubject} style="margin-left:8px;">
            {#each subjects as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>

        <label style="margin-left:8px;">
          Judul Materi:
          <input placeholder="Contoh: Teks Deskripsi 1" bind:value={materialTitle} style="margin-left:8px; min-width:320px;" />
        </label>

        <button on:click={createExam}>Buat Mapel</button>
        <button on:click={fetchExams}>Refresh</button>

        <select bind:value={selectedExamId} on:change={() => { const e = exams.find(x => x.id === selectedExamId); selectedExamTitle = e ? e.title : selectedExamTitle; loadQuestions(1); }} style="margin-left:8px;">
          <option value=''>-- pilih dari daftar --</option>
          {#each exams as ex}
            <option value={ex.id}>{ex.title}</option>
          {/each}
        </select>
      </div>
    </section>

    <hr style="margin:20px 0;" />

    <!-- tabs: soal | rekap -->
    <div style="display:flex; gap:8px; align-items:center;">
      <button on:click={() => { activeTab = 'soal'; }} class={activeTab==='soal' ? 'active-tab' : ''}>Soal</button>
      <button on:click={openRekapTab} class={activeTab==='rekap' ? 'active-tab' : ''}>Rekap Nilai</button>
    </div>

    <div style="margin-top:12px;">
      {#if activeTab === 'soal'}
        <!-- existing soal UI -->
        <section>
          <h2>Buat Soal untuk: {selectedExamTitle ?? (selectedExamId ? "ID " + selectedExamId : "—")}</h2>

          <div style="margin-top:12px;">
            <label>Tipe Soal:
              <select bind:value={qType} on:change={adjustDefaultOptsIfEmpty} style="margin-left:8px;">
                <option value="pg">PG (single choice)</option>
                <option value="mcma">MCMA (multiple correct)</option>
                <option value="tf">Benar / Salah</option>
              </select>
            </label>
          </div>

          <div style="margin-top:12px;">
            <label>Pertanyaan</label>
            <div><textarea bind:this={questionInput} bind:value={qText} rows="4" style="width:100%"></textarea></div>
          </div>

          <div style="margin-top:12px;">
            <label>Opsi</label>
            {#each opts as o, i}
              <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
                {#if qType === "mcma"}
                  <input type="checkbox" bind:checked={o.is_correct} />
                {:else}
                  <input type="radio" name={"correct-" + Math.random()} bind:group={correctAnswer} value={i} />
                {/if}
                <input placeholder={"Opsi " + (i + 1)} bind:value={o.text} style="flex:1" />
                <button on:click={() => removeOption(i)}>Hapus</button>
              </div>
            {/each}

            <div style="margin-top:8px;">
              <button on:click={addOption}>Tambah Opsi</button>
              <button on:click={saveQuestion} style="margin-left:8px;">Simpan Soal</button>
            </div>
          </div>

          <hr style="margin:20px 0;" />

          <section>
            <h2>Daftar Soal (Exam aktif)</h2>
            {#if !questions || questions.length === 0}
              <div style="color:#666;">Belum ada soal untuk exam ini.</div>
            {:else}
              <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
                {#each questions as q, idx}
                  <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div style="font-weight:600;">No. {(page-1)*limit + idx + 1} — {q.text}</div>
                      <div style="display:flex; gap:8px;">
                        <button on:click={() => deleteQuestion(q.id)}>Hapus Soal</button>
                      </div>
                    </div>
                    <div style="margin-top:8px;">
                      {#each q.options as opt}
                        <div style="display:flex; gap:8px; align-items:center;">
                          <div style="width:18px; text-align:center;">{opt.is_correct ? "✓" : ""}</div>
                          <div>{opt.text}</div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- pagination controls -->
            <div style="margin-top:12px; display:flex; gap:8px; align-items:center;">
              <button on:click={() => { if (page>1) loadQuestions(page-1); }} disabled={page<=1}>Prev</button>

              {#each Array(totalPages).fill(0).map((_,i) => i+1) as pnum}
                <button on:click={() => loadQuestions(pnum)} class={pnum===page ? 'active' : ''}>{pnum}</button>
              {/each}

              <button on:click={() => { if (page<totalPages) loadQuestions(page+1); }} disabled={page>=totalPages}>Next</button>
            </div>
          </section>
        </section>
      {:else}
        <!-- rekap tab -->
        <section>
          <h2>Rekap Nilai — {selectedExamTitle ?? '—'}</h2>
          <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
            <button on:click={loadAttempts} disabled={attemptsLoading || !selectedExamId}>{attemptsLoading ? 'Memuat...' : 'Refresh Rekap'}</button>
            <button on:click={exportAttemptsCSV} disabled={!attempts || attempts.length===0}>Export CSV</button>
            <div style="margin-left:auto; color:#666;">{attempts && attempts.length ? `Terdapat ${attempts.length} attempt` : ''}</div>
          </div>

          <div style="margin-top:12px;">
            {#if attemptsLoading}
              <div>Memuat rekap...</div>
            {:else if attemptsError}
              <div style="color:#b91c1c;">{attemptsError}</div>
            {:else if !attempts || attempts.length===0}
              <div style="color:#666;">Belum ada attempt untuk exam ini.</div>
            {:else}
              <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                <thead style="background:#f1f5f9;">
                  <tr>
                    <th style="padding:8px; text-align:left;">ID</th>
                    <th style="padding:8px; text-align:left;">Siswa</th>
                    <th style="padding:8px; text-align:left;">Mulai</th>
                    <th style="padding:8px; text-align:left;">Selesai</th>
                    <th style="padding:8px; text-align:left;">Durasi</th>
                    <th style="padding:8px; text-align:left;">Skor</th>
                    <th style="padding:8px; text-align:left;">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {#each attempts as a}
                    <tr>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">{a.id}</td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">{a.student_name ?? '-'}</td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">{formatToWIB(a.started_at)}</td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">{formatToWIB(a.finished_at)}</td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">
                        {formatDurationHMS(a.duration_seconds)}
                      </td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">{a.score ?? '-'}</td>
                      <td style="padding:8px; border-top:1px solid #e6eef7;">
                        <button on:click={() => viewAttempt(a.id)}>Detail</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </section>
      {/if}
    </div>

    <!-- attempt detail modal -->
    {#if showAttemptModal}
      <div style="position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:9998;">
        <div style="width:90%; max-width:880px; background:white; border-radius:10px; padding:18px; max-height:80vh; overflow:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Detail Attempt {attemptDetail?.attempt?.id ?? ''}</h3>
            <div><button on:click={closeAttemptModal}>Tutup</button></div>
          </div>

          {#if attemptDetailLoading}
            <div style="margin-top:12px;">Memuat detail...</div>
          {:else if attemptDetail?.error}
            <div style="margin-top:12px; color:#b91c1c;">{attemptDetail.error}</div>
          {:else if attemptDetail}
            <div style="margin-top:12px;">
              <div><strong>Siswa:</strong> {attemptDetail.attempt.student_name ?? '-'}</div>
              <div><strong>Mulai:</strong> {formatToWIB(attemptDetail.attempt.started_at)}</div>
              <div><strong>Selesai:</strong> {formatToWIB(attemptDetail.attempt.finished_at)}</div>
              <div style="margin-top:8px;"><strong>Skor:</strong> {attemptDetail.attempt.score ?? '-'} / (jumlah soal {attemptDetail.answers ? attemptDetail.answers.length : 0})</div>

              <hr style="margin:12px 0;" />

              <div>
                {#if attemptDetail.answers && attemptDetail.answers.length}
                  {#each attemptDetail.answers as ans, idx}
                    <div style="border:1px solid #e6eef7; padding:10px; border-radius:6px; margin-bottom:8px;">
                      <div style="font-weight:600;">No. {idx+1} — Question ID {ans.question_id}</div>
                      <div style="margin-top:6px;">Jawaban siswa: <code>{JSON.stringify(ans.answer)}</code></div>
                    </div>
                  {/each}
                {:else}
                  <div>Tidak ada jawaban tersimpan untuk attempt ini.</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </main>
{/if}

<style>
  .success { background: #16a34a; }
  .error { background: #dc2626; }
  .info { background: #334155; }

  /* small tab styles */
  .active-tab {
    background:#1e3a8a; color:white; padding:6px 10px; border-radius:6px; border:none;
  }
  button { padding:6px 10px; border-radius:6px; border:1px solid #cbd5e1; background:white; cursor:pointer; }
  button[disabled]{ opacity:0.6; cursor:not-allowed; }
  .active { background:#e0f2fe; }
</style>
