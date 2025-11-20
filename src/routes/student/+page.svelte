<script lang="ts">
  import { onMount } from 'svelte';

  // state
  let student: { subject?: string; fullname?: string; kelas?: string } | null = null;
  let showExamList = true; // true = show exam cards; false = show questions for selectedExamId
  let examsAll: Array<{ id:number; title:string; description?:string }> = [];
  let examsFiltered: Array<{ id:number; title:string }> = [];
  let selectedExamId: number | null = null;
  let selectedExamTitle: string | null = null;
  let questions: Array<any> = [];
  let answers: Record<number, any> = {};
  let loading = false;

  // login form model
  let formSubject = 'Bahasa Indonesia';
  let formFullname = '';
  let formKelas = '6A';
  const SUBJECTS = ['Bahasa Indonesia', 'Matematika'];

  // helpers
  function loadStudentFromStorage() {
    try {
      const raw = localStorage.getItem('cbt_student');
      if (!raw) {
        student = null;
        return;
      }
      const p = JSON.parse(raw);
      student = {
        subject: p.subject ? String(p.subject) : undefined,
        fullname: p.fullname ? String(p.fullname) : undefined,
        kelas: p.kelas ? String(p.kelas) : undefined
      };
      // after load, keep UI on exam list
      showExamList = true;
    } catch (e) {
      console.warn('parse cbt_student failed', e);
      student = null;
    }
  }

  function persistStudentToStorage() {
    const payload = { subject: formSubject, fullname: formFullname.trim(), kelas: formKelas };
    localStorage.setItem('cbt_student', JSON.stringify(payload));
    loadStudentFromStorage();
  }

  function logoutStudent() {
    localStorage.removeItem('cbt_student');
    student = null;
    examsAll = [];
    examsFiltered = [];
    selectedExamId = null;
    selectedExamTitle = null;
    questions = [];
    answers = {};
    showExamList = true;
  }

  onMount(async () => {
    loadStudentFromStorage();
    await loadExams();
  });

  async function loadExams() {
    loading = true;
    try {
      const res = await fetch('/api/exams', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch exams failed');
      const data = await res.json();
      examsAll = Array.isArray(data) ? data : [];

      // filter according to student subject if exists
      if (student && student.subject) {
        const subj = String(student.subject).toLowerCase().trim();
        examsFiltered = examsAll.filter(e => {
          const t = (e.title||'').toLowerCase();
          // match if subject contained or appears at start
          return t.includes(subj) || t.startsWith(subj);
        });
        // fallback: if no matches, show all (prevents empty screens if teacher used different naming)
        if (examsFiltered.length === 0) examsFiltered = examsAll.slice();
      } else {
        examsFiltered = examsAll.slice();
      }
    } catch (e) {
      console.error('loadExams error', e);
      examsAll = [];
      examsFiltered = [];
    } finally {
      loading = false;
    }
  }

  // when click a card -> set selectedExamId and load questions (switch view)
  async function openExamCard(examId:number) {
    selectedExamId = Number(examId);
    const found = examsFiltered.find(x => Number(x.id) === Number(examId));
    selectedExamTitle = found ? found.title : null;
    await loadQuestions();
    showExamList = false;
  }

  // back to cards
  function backToExamList() {
    showExamList = true;
    selectedExamId = null;
    selectedExamTitle = null;
    questions = [];
    answers = {};
  }

  async function loadQuestions() {
    if (!selectedExamId) {
      questions = [];
      return;
    }
    loading = true;
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/questions?page=1&limit=200`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch questions failed:' + res.status);
      const data = await res.json();
      questions = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      // reset answers
      answers = {};
    } catch (e) {
      console.error('loadQuestions error', e);
      questions = [];
    } finally {
      loading = false;
    }
  }

  function toggleAnswer(q:any, opt:any) {
    const qid = Number(q.id);
    if (q.type === 'mcma') {
      answers[qid] = answers[qid] || [];
      const idx = answers[qid].indexOf(opt.id);
      if (idx === -1) answers[qid].push(opt.id);
      else answers[qid].splice(idx, 1);
      answers = { ...answers };
    } else {
      answers[qid] = opt.id;
      answers = { ...answers };
    }
  }

  async function submitAttempt() {
    try {
      const payload = { exam_id: selectedExamId, student_name: student?.fullname ?? null, answers };
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Jawaban terkirim ke server.');
        // setelah submit, kembali ke daftar exam atau tetap di view? kita reset answers saja
        answers = {};
      } else {
        alert('Gagal kirim jawaban ke server.');
      }
    } catch (e) {
      console.warn('submitAttempt error', e);
      alert('Gagal kirim jawaban (network).');
    }
  }

  // when login form submitted
  async function handleLogin() {
    if (!formFullname.trim()) { alert('Tulis nama lengkap'); return; }
    persistStudentToStorage();
    await loadExams();
    // show exam cards
    showExamList = true;
  }

  // small utility for card subtitle (optional)
  function examSubtitle(title:string) {
    // try to strip subject prefix for cleaner card text (if title like "Bahasa Indonesia - ...")
    const parts = title.split('-').map(s=>s.trim());
    if (parts.length>1) return parts.slice(1).join(' - ');
    return title;
  }
</script>

<main style="padding:24px; max-width:980px; margin:0 auto;">

  {#if !student}
    <!-- LOGIN CARD -->
    <div style="background:#fff; padding:28px; border-radius:12px; box-shadow:0 10px 30px rgba(15,23,42,0.06);">
      <h2 style="margin:0 0 8px 0; font-size:28px;">Selamat Datang — Siswa</h2>
      <p style="color:#667085; margin-top:4px;">Pilih mata pelajaran, isi nama lengkap, pilih kelas, lalu klik Login.</p>

      <div style="margin-top:20px;">
        <label style="display:block; margin-bottom:8px; font-weight:600;">Mata Pelajaran</label>
        <select bind:value={formSubject} style="width:100%; padding:12px; border-radius:8px; border:1px solid #e6eef7;">
          {#each SUBJECTS as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      <div style="margin-top:14px;">
        <label style="display:block; margin-bottom:8px; font-weight:600;">Nama Lengkap</label>
        <input placeholder="Tulis nama lengkap siswa..." bind:value={formFullname} style="width:100%; padding:12px; border-radius:8px; border:1px solid #e6eef7;" />
      </div>

      <div style="margin-top:14px;">
        <label style="display:block; margin-bottom:8px; font-weight:600;">Kelas</label>
        <select bind:value={formKelas} style="width:100%; padding:12px; border-radius:8px; border:1px solid #e6eef7;">
          <option>6A</option>
          <option>6B</option>
          <option>6C</option>
        </select>
      </div>

      <div style="margin-top:18px; display:flex; gap:12px;">
        <button on:click={handleLogin} style="background:#0ea5a4; color:white; border:none; padding:10px 16px; border-radius:10px; cursor:pointer;">Login</button>
        <button on:click={() => { formFullname=''; formKelas='6A'; formSubject=SUBJECTS[0]; }} style="background:#fff; border:1px solid #cbd5e1; padding:10px 12px; border-radius:10px;">Reset</button>
      </div>
    </div>

  {:else}
    <!-- Logged in: show header + either exam cards or questions -->
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
      <div style="font-weight:700;">Login sebagai:</div>
      <div>
        <span style="font-weight:600;">{student.fullname ?? '-'}</span> — <span>{student.kelas ?? '-'}</span> <span style="color:#6b7280;">({student.subject ?? '-'})</span>
      </div>
      <div style="margin-left:auto; display:flex; gap:10px;">
        <button on:click={logoutStudent} style="border:1px solid #cbd5e1; background:white; padding:8px 10px; border-radius:8px;">Logout</button>
        <button on:click={loadExams} style="border:1px solid #cbd5e1; background:white; padding:8px 10px; border-radius:8px;">Refresh</button>
      </div>
    </div>

    {#if showExamList}
      <!-- Cards grid -->
      <h3 style="text-align:center; margin-bottom:14px; font-weight:600;">Pilih Materi — {student.subject}</h3>
      {#if loading}
        <div style="text-align:center; color:#6b7280;">Memuat daftar materi...</div>
      {:else if !examsFiltered || examsFiltered.length===0}
        <div style="text-align:center; color:#6b7280;">Tidak ada materi tersedia.</div>
      {:else}
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px;">
          {#each examsFiltered as ex}
            <div role="button" on:click={() => openExamCard(ex.id)} style="background:#fff; padding:18px; border-radius:10px; box-shadow:0 6px 18px rgba(2,6,23,0.06); cursor:pointer; border:1px solid #eef2f7;">
              <div style="font-weight:700; font-size:16px; margin-bottom:8px;">{ex.title}</div>
              <div style="color:#6b7280; font-size:14px;">{examSubtitle(ex.title)}</div>
              <div style="margin-top:12px; text-align:right;"><button style="padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; background:white;">Buka</button></div>
            </div>
          {/each}
        </div>
      {/if}

    {:else}
      <!-- Questions view -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:600;">Soal untuk: {selectedExamTitle}</div>
        <div style="display:flex; gap:8px;">
          <button on:click={backToExamList} style="border:1px solid #cbd5e1; background:white; padding:8px 10px; border-radius:8px;">Kembali ke Pilihan Exam</button>
          <button on:click={loadQuestions} style="border:1px solid #cbd5e1; background:white; padding:8px 10px; border-radius:8px;">Refresh Soal</button>
        </div>
      </div>

      {#if loading}
        <div style="text-align:center; color:#6b7280;">Memuat soal...</div>
      {:else if !questions || questions.length===0}
        <div style="text-align:center; color:#6b7280;">Belum ada soal untuk exam ini.</div>
      {:else}
        <div>
          {#each questions as q, idx}
            <article style="background:#fff; border-radius:10px; padding:16px; margin-bottom:14px; border:1px solid #eef2f7;">
              <div style="font-weight:700; margin-bottom:10px;">No. {idx+1} — {q.text}</div>
              <div>
                {#each q.options as opt}
                  <label style="display:flex; gap:12px; align-items:center; margin-bottom:8px; cursor:pointer;">
                    {#if q.type === 'mcma'}
                      <input type="checkbox" on:change={() => toggleAnswer(q,opt)} checked={Array.isArray(answers[q.id]) && answers[q.id].includes(opt.id)} />
                    {:else}
                      <input type="radio" name={'q-' + q.id} on:change={() => toggleAnswer(q,opt)} checked={answers[q.id] === opt.id} />
                    {/if}
                    <div>{opt.text}</div>
                  </label>
                {/each}
              </div>
            </article>
          {/each}
        </div>

        <div style="text-align:center; margin-top:12px;">
          <button on:click={submitAttempt} style="background:#0ea5a4; color:white; padding:10px 14px; border-radius:10px; border:none;">Kirim Jawaban</button>
        </div>
      {/if}
    {/if}
  {/if}
</main>

<style>
  :global(body) { background:#f8fafc; color:#0f172a; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
</style>
