// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB8CqxM0YvkSNjgus21aEXUipXINqbQ86A",
  authDomain: "attendancemonitorsystem.firebaseapp.com",
  projectId: "attendancemonitorsystem",
  storageBucket: "attendancemonitorsystem.firebasestorage.app",
  messagingSenderId: "673455930263",
  appId: "1:673455930263:web:e0c49c346506eeb3c462d2",
  measurementId: "G-ML5YQ53KVB"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Student marks attendance
function markAttendance() {
  let user = auth.currentUser;
  if (!user) {
    alert("Please login first!");
    return;
  }

  // Get active session
  db.collection("sessions").where("active", "==", true)
    .orderBy("createdAt", "desc").limit(1)
    .get().then(snapshot => {
      if (snapshot.empty) {
        alert("No active session found.");
        return;
      }

      let sessionId = snapshot.docs[0].id;

      // Prevent duplicate attendance
      db.collection("attendance").where("studentId", "==", user.email)
        .where("sessionId", "==", sessionId)
        .get().then(existing => {
          if (!existing.empty) {
            alert("You already marked attendance for this class!");
            return;
          }

          db.collection("attendance").add({
            studentId: user.email,
            sessionId: sessionId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          }).then(() => {
            alert("Attendance marked for " + user.email + " in " + sessionId);
          });
        });
    });
}

// Load dashboard in real-time
function loadAttendance() {
  db.collection("attendance").orderBy("timestamp", "desc")
    .onSnapshot(async (snapshot) => {
      const list = document.getElementById("attendanceList");
      list.innerHTML = "";

      for (let doc of snapshot.docs) {
        let data = doc.data();

        // Lookup student info
        let stuDoc = await db.collection("students")
          .where("email", "==", data.studentId).get();

        let stuName = data.studentId;
        if (!stuDoc.empty) {
          stuName = stuDoc.docs[0].data().name + " (" + stuDoc.docs[0].data().course + ")";
        }

        let li = document.createElement("li");
        let time = data.timestamp ? data.timestamp.toDate() : "Pending...";
        li.textContent = `${stuName} - ${data.sessionId} - ${data.timestamp.toDate()}`;
        list.appendChild(li);
      }
    });
}

// Seed dummy students (fix: added missing comma)
function seedStudents() {
  const students = [
    { studentId: "S001", name: "Madhu", course: "Computer Science", email: "student1@test.com" },
    { studentId: "S002", name: "Paavan Ram", course: "Computer Science", email: "student2@test.com" },
    { studentId: "S003", name: "Phani", course: "Computer Science", email: "student3@test.com" },
    { studentId: "S004", name: "Balakrishna", course: "Computer Science", email: "student4@test.com" },
    { studentId: "S005", name: "Madhuri", course: "Computer Science", email: "student5@test.com" },
    { studentId: "S006", name: "Yamini", course: "Computer Science", email: "student6@test.com" }
  ];

  students.forEach(stu => {
    db.collection("students").doc(stu.studentId).set(stu);
  });

  alert("Dummy students added!");
}


// QR Generator (Faculty Side)
function generateQR() {
  // Unique session ID (class timestamp)
  let sessionId = "class-" + Date.now();

  // Generate QR
  let qr = new QRious({
    element: document.getElementById("qr"),
    value: sessionId,
    size: 200
  });

  // Save session in Firestore
  db.collection("sessions").doc(sessionId).set({
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    faculty: auth.currentUser ? auth.currentUser.email : "unknown",
    active: true
  });

  // Deactivate old sessions
  db.collection("sessions").where("active", "==", true).get().then(snapshot => {
    snapshot.forEach(doc => {
      if (doc.id !== sessionId) {
        doc.ref.update({ active: false });
      }
    });
  });

  alert("QR Generated for session: " + sessionId);
}


// QR Scanner (Student Side)
let html5QrCode; // global reference to scanner

// Start QR Scanner
function startScanner() {
  html5QrCode = new Html5Qrcode("reader");

  html5QrCode.start(
    { facingMode: "environment" }, // use back camera if available
    {
      fps: 10,    // scans per second
      qrbox: 250  // size of scan box
    },
    (decodedText) => {
      // ✅ QR detected
      markAttendanceFromQR(decodedText);
      stopScanner(); // stop after first scan
    },
    (errorMessage) => {
      // ignore scan errors
    }
  ).catch(err => {
    console.error("Unable to start scanner", err);
    alert("Camera access failed: " + err);
  });
}

// Stop QR Scanner
function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      console.log("Scanner stopped");
    }).catch(err => {
      console.error("Failed to stop scanner", err);
    });
  }
}

// Mark Attendance from QR
// Mark Attendance from QR (Save StudentID + ClassID + Timestamp)
function markAttendanceFromQR(sessionId) {
  let user = auth.currentUser;
  if (!user) {
    alert("Please login first!");
    return;
  }

  // Prevent duplicate attendance
  db.collection("attendance")
    .where("studentId", "==", user.email)
    .where("sessionId", "==", sessionId)
    .get().then(existing => {
      if (!existing.empty) {
        alert("You already marked attendance for this session!");
        return;
      }

      // ✅ Save record in Firestore
      db.collection("attendance").add({
        studentId: user.email,     // Student email (can also use StudentID from students collection)
        sessionId: sessionId,      // Class ID from QR code
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // Exact server time
      }).then(() => {
        alert("✅ Attendance marked for " + user.email + " in " + sessionId);
      }).catch(err => {
        console.error("Error saving attendance:", err);
        alert("Failed to mark attendance. Try again.");
      });
    });
}

// Load Attendance Summary (% per student)
async function loadSummary() {
  const tableBody = document.querySelector("#summaryTable tbody");
  tableBody.innerHTML = "";

  // 1. Get all students
  const studentsSnap = await db.collection("students").get();
  const students = {};
  studentsSnap.forEach(doc => {
    students[doc.id] = doc.data();
  });

  // 2. Count total classes (sessions)
  const sessionsSnap = await db.collection("sessions").get();
  const totalClasses = sessionsSnap.size;

  // 3. Count attendance per student
  const attendanceSnap = await db.collection("attendance").get();
  const attendanceCount = {};
  attendanceSnap.forEach(doc => {
    let att = doc.data();
    if (!attendanceCount[att.studentId]) {
      attendanceCount[att.studentId] = 0;
    }
    attendanceCount[att.studentId]++;
  });

  // 4. Build table rows
  for (let sid in students) {
    const stu = students[sid];
    const attended = attendanceCount[stu.email] || 0;
    const percentage = totalClasses > 0 ? ((attended / totalClasses) * 100).toFixed(1) : 0;

    let row = `
      <tr>
        <td>${stu.studentId}</td>
        <td>${stu.name}</td>
        <td>${stu.course}</td>
        <td>${attended}</td>
        <td>${totalClasses}</td>
        <td>${percentage}%</td>
      </tr>
    `;
    tableBody.innerHTML += row;
  }
}

// Load session dropdown with available sessions
async function loadSessions() {
  const sessionSelect = document.getElementById("sessionSelect");
  sessionSelect.innerHTML = "";

  const sessionsSnap = await db.collection("sessions").orderBy("createdAt", "desc").get();

  sessionsSnap.forEach(doc => {
    let option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.id;
    sessionSelect.appendChild(option);
  });

  // Auto-load latest session
  if (sessionsSnap.size > 0) {
    loadSessionAttendance();
  }
}

// Load attendance for selected session
async function loadSessionAttendance() {
  const sessionId = document.getElementById("sessionSelect").value;
  if (!sessionId) return;

  const presentList = document.getElementById("presentList");
  const absentList = document.getElementById("absentList");

  presentList.innerHTML = "";
  absentList.innerHTML = "";

  // 1. Get all students
  const studentsSnap = await db.collection("students").get();
  const students = {};
  studentsSnap.forEach(doc => {
    students[doc.id] = doc.data();
  });

  // 2. Get attendance for this session
  const attendanceSnap = await db.collection("attendance")
    .where("sessionId", "==", sessionId).get();

  const presentStudents = new Set();
  attendanceSnap.forEach(doc => {
    presentStudents.add(doc.data().studentId);
  });

  // 3. Separate present/absent
  for (let sid in students) {
    let stu = students[sid];
    let li = document.createElement("li");
    li.textContent = `${stu.studentId} - ${stu.name} (${stu.course})`;

    if (presentStudents.has(stu.email)) {
      presentList.appendChild(li); // ✅ Present
    } else {
      absentList.appendChild(li); // ❌ Absent
    }
  }
}


