// --- Add new break input fields dynamically for weekdays ---
document.getElementById('addBreak').addEventListener('click', function () {
  const container = document.getElementById('breaksContainer');
  const div = document.createElement('div');
  div.classList.add('breakInput');
  div.innerHTML =
    '<label>Break Start: <input type="time" name="breakStart"></label>' +
    '<label>Break End: <input type="time" name="breakEnd"></label>';
  container.appendChild(div);
});

// --- Toggle Saturday Options based on checkbox ---
document.getElementById('saturdayEnabled').addEventListener('change', function () {
  document.getElementById('saturdayOptions').style.display = this.checked ? 'block' : 'none';
});

// --- Add new break input fields dynamically for Saturday ---
document.getElementById('addSaturdayBreak').addEventListener('click', function () {
  const container = document.getElementById('saturdayBreaksContainer');
  const div = document.createElement('div');
  div.classList.add('saturdayBreakInput');
  div.innerHTML =
    '<label>Saturday Break Start: <input type="time" name="saturdayBreakStart"></label>' +
    '<label>Saturday Break End: <input type="time" name="saturdayBreakEnd"></label>';
  container.appendChild(div);
});

// --- Utility function to read an Excel file using SheetJS ---
function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      resolve(workbook);
    };
    reader.onerror = function (error) {
      reject(error);
    };
    reader.readAsArrayBuffer(file);
  });
}

// --- Parse Classes Excel File and build classes array ---
async function parseClassesExcel(file) {
  const workbook = await readExcelFile(file);
  const classes = [];
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);
    const theorySubjects = [];
    const practicalSubjects = [];
    const subjectWeeklyHours = {};
    jsonData.forEach(row => {
      const subject = row["Subject Name"];
      const type = row["Type"];
      const hours = row["Hours per Week"];
      if (subject && type) {
        if (type.toLowerCase() === "theory") {
          theorySubjects.push(subject);
        } else if (type.toLowerCase() === "practical") {
          practicalSubjects.push(subject);
        }
        subjectWeeklyHours[subject] = hours;
      }
    });
    classes.push({
      className: sheetName,
      theorySubjects,
      practicalSubjects,
      subjectWeeklyHours
    });
  });
  return classes;
}

// --- Parse Faculty Excel File and build faculties array ---
async function parseFacultyExcel(file) {
  const workbook = await readExcelFile(file);
  const faculties = [];
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);
    const theorySubjects = [];
    const practicalSubjects = [];
    jsonData.forEach(row => {
      const subject = row["Subject Name"];
      const type = row["Type"];
      if (subject && type) {
        if (type.toLowerCase() === "theory") {
          theorySubjects.push(subject);
        } else if (type.toLowerCase() === "practical") {
          practicalSubjects.push(subject);
        }
      }
    });
    faculties.push({
      facultyName: sheetName,
      theorySubjects,
      practicalSubjects
    });
  });
  return faculties;
}

// --- Global Settings Storage ---
window.timetableSettings = {};
let isSubmitted = false;
// Global variable to store generated data for later use
window.generatedData = null;

// Refresh/close/navigate karne se pehle browser ka built-in confirmation dikhao,
// taaki user accidentally generated timetable na khoye (refresh karte hi sab data ud jata hai).
// NOTE: Modern browsers (Chrome, Firefox, Safari) security reasons se custom text allow
// nahi karte beforeunload dialog mein — woh apna generic "Leave site? Changes you made
// may not be saved." wala message hi dikhayenge, lekin Cancel/Leave (ya Cancel/Reload)
// ka confirm-or-stay behaviour bilkul kaam karega, browser khud handle karta hai.
window.addEventListener('beforeunload', function (e) {
  if (window.generatedData) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// Prevent accidental browser step changes on numeric inputs.
document.querySelectorAll('input[type="number"]').forEach((input) => {
  input.addEventListener('wheel', (event) => {
    event.preventDefault();
  }, { passive: false });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
    }
  });
});

// --- Reset generate button text when form changes ---
document.getElementById('timetableForm').addEventListener('input', function () {
  document.getElementById('generateButton').value = "Generate";
  isSubmitted = false;
});

// --- Form Submission and Timetable Generation ---
document.getElementById('timetableForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  document.getElementById('facultyTimetableOutput').innerHTML = '';
  document.getElementById('resourceTimetableOutput').innerHTML = '';

  if (isSubmitted) {
    const confirmRegenerate = confirm("Are you sure you want to regenerate?");
    if (!confirmRegenerate) {
      return;
    }
  }

  // Read input values from the form
  const department = document.querySelector('input[name="department"]').value;
  const startTime = document.querySelector('input[name="startTime"]').value;
  const endTime = document.querySelector('input[name="endTime"]').value;
  const lectureDuration = parseFloat(document.querySelector('input[name="lectureDuration"]').value);
  const maxFacultyLecturesPerDay = parseInt(document.querySelector('input[name="maxFacultyLecturesPerDay"]').value);
  const maxSubjectLecturesPerDay = parseInt(document.querySelector('input[name="maxSubjectLecturesPerDay"]').value);
  const numberOfRooms = parseInt(document.querySelector('input[name="numberOfRooms"]').value);
  const numberOfLabs = parseInt(document.querySelector('input[name="numberOfLabs"]').value);

  // Collect weekday break times
  const breakTimes = [];
  const breakInputs = document.querySelectorAll('#breaksContainer .breakInput');
  breakInputs.forEach(div => {
    const breakStartInput = div.querySelector('input[name="breakStart"]');
    const breakEndInput = div.querySelector('input[name="breakEnd"]');
    if (breakStartInput && breakEndInput) {
      const breakStart = breakStartInput.value;
      const breakEnd = breakEndInput.value;
      if (breakStart && breakEnd) {
        breakTimes.push({ start: breakStart, end: breakEnd });
      }
    }
  });

  // Save basic timetable settings for later use (e.g., rendering)
  window.timetableSettings = { startTime, endTime, lectureDuration, breakTimes };

  // Collect Saturday scheduling data if enabled
  const saturdayEnabled = document.getElementById('saturdayEnabled').checked;
  let saturdayBreakTimes = [];
  if (saturdayEnabled) {
    const saturdayBreakInputs = document.querySelectorAll('#saturdayBreaksContainer .saturdayBreakInput');
    saturdayBreakInputs.forEach(div => {
      const breakStartInput = div.querySelector('input[name="saturdayBreakStart"]');
      const breakEndInput = div.querySelector('input[name="saturdayBreakEnd"]');
      if (breakStartInput && breakEndInput) {
        const breakStart = breakStartInput.value;
        const breakEnd = breakEndInput.value;
        if (breakStart && breakEnd) {
          saturdayBreakTimes.push({ start: breakStart, end: breakEnd });
        }
      }
    });
  }

  // Get the uploaded Excel files
  const classesFile = document.getElementById('classesExcel').files[0];
  const facultyFile = document.getElementById('facultyExcel').files[0];
  if (!classesFile || !facultyFile) {
    alert("Please upload both Classes and Faculty Excel files.");
    return;
  }

  let classes, faculties;
  try {
    classes = await parseClassesExcel(classesFile);
    faculties = await parseFacultyExcel(facultyFile);
  } catch (err) {
    console.error("Error parsing Excel files:", err);
    alert("Error parsing Excel files. Please check the file format.");
    return;
  }

  // Assemble all form data to send to the server
  const formData = {
    department,
    classes,
    faculties,
    startTime,
    endTime,
    lectureDuration,
    breakTimes,
    maxFacultyLecturesPerDay,
    maxSubjectLecturesPerDay,
    numberOfRooms,
    numberOfLabs,
    saturdayEnabled
  };

  if (saturdayEnabled) {
    formData.saturdayStartTime = document.querySelector('input[name="saturdayStartTime"]').value;
    formData.saturdayEndTime = document.querySelector('input[name="saturdayEndTime"]').value;
    formData.saturdayBreakTimes = saturdayBreakTimes;
    window.timetableSettings.saturdayStartTime = formData.saturdayStartTime;
    window.timetableSettings.saturdayEndTime = formData.saturdayEndTime;
    window.timetableSettings.saturdayBreakTimes = saturdayBreakTimes;
  }

  // ─── CHANGED: Single POST to /generateTimetable (no more /submitData separately) ───
  // Pehle do alag fetch calls the:
  //   1. POST /submitData  → session mein data save karta tha
  //   2. GET  /generateTimetable → session se data padh ke timetable banata tha
  // Vercel pe session share nahi hoti different containers mein, isliye fail hota tha.
  // Ab: ek hi POST call mein formData seedha /generateTimetable ko bhej do.
  try {
    const response = await fetch('/generateTimetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (!response.ok) {
      throw new Error("Failed to generate timetable");
    }
    const data = await response.json();
    window.generatedData = data;
    sessionStorage.setItem('timetableData', JSON.stringify(data));
    renderTimetable(data);
    document.getElementById("timetableOutput").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    alert("Error generating timetable.");
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────────────

  isSubmitted = true;
  document.getElementById('generateButton').value = "Regenerate";
});

// --- Helper Functions for Rendering the Timetable ---
// Convert "HH:MM" format to minutes (integer)
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Convert minutes back to "HH:MM" string format
function fromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h.toString().padStart(2, '0') + ":" + m.toString().padStart(2, '0');
}

// Check if a time block falls entirely within a break period for a given day.
function isBreakTime(day, blockStartMin, blockEndMin) {
  let breaks = (day === 'Saturday' && window.timetableSettings.saturdayBreakTimes &&
    window.timetableSettings.saturdayBreakTimes.length > 0)
    ? window.timetableSettings.saturdayBreakTimes
    : window.timetableSettings.breakTimes;
  return breaks.some(b => {
    const bStart = toMinutes(b.start);
    const bEnd = toMinutes(b.end);
    return blockStartMin >= bStart && blockEndMin <= bEnd;
  });
}

// Render the main timetable HTML table from the generated data.
function renderTimetable(data) {
  document.querySelector('.output').style.display = 'block';
  const department = data.department.toUpperCase();
  const timetable = data.timetable;
  let html = `<h1 style="text-align: center">Department: ${department}</h1>`;

  for (const className in timetable) {
    html += `<h2>Class: ${className}</h2>`;
    const days = Object.keys(timetable[className]);
    // Collect all unique time boundaries across days.
    let boundariesSet = new Set();
    days.forEach(day => {
      timetable[className][day].forEach(slot => {
        boundariesSet.add(toMinutes(slot.time.start));
        boundariesSet.add(toMinutes(slot.time.end));
      });
    });
    let boundaries = Array.from(boundariesSet).sort((a, b) => a - b);

    // Build row data from these boundaries.
    let rowData = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startMin = boundaries[i];
      const endMin = boundaries[i + 1];
      const timeLabel = `${fromMinutes(startMin)} - ${fromMinutes(endMin)}`;
      const cells = days.map(day => {
        let cellContent = "";
        let slotFound = false;
        const slots = timetable[className][day];
        for (let j = 0; j < slots.length; j++) {
          const slot = slots[j];
          const slotStartMin = toMinutes(slot.time.start);
          const slotEndMin = toMinutes(slot.time.end);
          if (slotStartMin <= startMin && slotEndMin >= endMin) {
            slotFound = true;
            if (slot.lecture) {
              cellContent = `<strong>${slot.lecture.subject || ""}</strong><br>
                                         Venue: ${slot.lecture.venue || ""}<br>
                                         Faculty: ${slot.lecture.faculty || ""}`;
            }
            break;
          }
        }
        if (!slotFound && isBreakTime(day, startMin, endMin)) {
          cellContent = "Break";
        }
        return { content: cellContent, rowspan: 1, skip: false };
      });
      rowData.push({ startMin, endMin, timeLabel, cells });
    }

    // Merge adjacent break cells vertically.
    for (let col = 0; col < days.length; col++) {
      let row = 0;
      while (row < rowData.length) {
        const cell = rowData[row].cells[col];
        if (cell.content === "Break" && !cell.skip) {
          let breakPeriod = null;
          let blockStart = rowData[row].startMin;
          let blockEnd = rowData[row].endMin;
          let breaks = (days[col] === 'Saturday' && window.timetableSettings.saturdayBreakTimes &&
            window.timetableSettings.saturdayBreakTimes.length > 0)
            ? window.timetableSettings.saturdayBreakTimes
            : window.timetableSettings.breakTimes;
          for (let b of breaks) {
            const bStart = toMinutes(b.start);
            const bEnd = toMinutes(b.end);
            if (blockStart >= bStart && blockEnd <= bEnd) {
              breakPeriod = { start: bStart, end: bEnd };
              break;
            }
          }
          if (breakPeriod) {
            let rowspan = 1;
            let nextRow = row + 1;
            while (nextRow < rowData.length) {
              const nextCell = rowData[nextRow].cells[col];
              if (nextCell.content === "Break" &&
                rowData[nextRow].startMin >= breakPeriod.start &&
                rowData[nextRow].endMin <= breakPeriod.end) {
                rowspan++;
                nextCell.skip = true;
                nextRow++;
              } else {
                break;
              }
            }
            cell.rowspan = rowspan;
          }
        }
        row++;
      }
    }

    // Build the HTML table using the row data.
    html += `<table>
                  <thead>
                    <tr>
                      <th style="white-space: nowrap;">Time</th>
                      ${days.map(day => `<th>${day}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>`;
    rowData.forEach(row => {
      html += `<tr><td>${row.timeLabel}</td>`;
      for (let col = 0; col < row.cells.length; col++) {
        const cell = row.cells[col];
        if (cell.skip) continue;
        if (cell.rowspan > 1) {
          html += `<td rowspan="${cell.rowspan}">${cell.content}</td>`;
        } else {
          html += `<td>${cell.content}</td>`;
        }
      }
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  }
  document.getElementById('timetableOutput').innerHTML = html;
}

// --- New Functions for Rendering Faculty and Resource Timetables ---
function renderFacultyTimetable(data) {
  const facultyData = data.facultyTimetable;
  let html = `<h1 style="text-align: center">Faculty Timetables</h1>`;

  // Define the fixed day order.
  const fixedDayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Loop through each faculty member.
  for (const faculty in facultyData) {
    html += `<h2>Faculty: ${faculty}</h2>`;

    // Get the days available for this faculty and sort them based on the fixed order.
    const availableDays = fixedDayOrder.filter(day => facultyData[faculty][day]);

    // Create a set of all time slots (rows) across the available days.
    const timeSet = new Set();
    availableDays.forEach(day => {
      Object.keys(facultyData[faculty][day]).forEach(time => {
        timeSet.add(time);
      });
    });
    // Sort time slots assuming format "HH:MM - HH:MM"
    const times = Array.from(timeSet).sort((a, b) => {
      const [aStart] = a.split(' - ');
      const [bStart] = b.split(' - ');
      return aStart.localeCompare(bStart);
    });

    // Build the table header.
    html += `<table border="1" cellspacing="0" cellpadding="5">
               <thead>
                 <tr>
                   <th style="white-space: nowrap;">Time</th>
                   ${availableDays.map(day => `<th>${day}</th>`).join('')}
                 </tr>
               </thead>
               <tbody>`;

    // Build table rows for each time slot.
    times.forEach(time => {
      html += `<tr><td>${time}</td>`;
      availableDays.forEach(day => {
        const lecture = facultyData[faculty][day][time] || '';
        html += `<td>${lecture}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  }

  document.getElementById('facultyTimetableOutput').innerHTML = html;
}

function renderResourceTimetable(data) {
  const resourceData = data.resourceTimetable;
  let html = `<h1 style="text-align: center">Resource Timetables</h1>`;

  // Define the fixed day order.
  const fixedDayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Loop through each resource.
  for (const resource in resourceData) {
    html += `<h2>Resource: ${resource}</h2>`;

    // Get the days available for this resource and sort them according to fixedDayOrder.
    const availableDays = fixedDayOrder.filter(day => resourceData[resource][day]);

    // Create a set of all time slots (rows) across available days.
    const timeSet = new Set();
    availableDays.forEach(day => {
      Object.keys(resourceData[resource][day]).forEach(time => {
        timeSet.add(time);
      });
    });
    // Sort time slots assuming format "HH:MM - HH:MM"
    const times = Array.from(timeSet).sort((a, b) => {
      const [aStart] = a.split(' - ');
      const [bStart] = b.split(' - ');
      return aStart.localeCompare(bStart);
    });

    // Build the table header.
    html += `<table border="1" cellspacing="0" cellpadding="5">
               <thead>
                 <tr>
                   <th style="white-space: nowrap;">Time</th>
                   ${availableDays.map(day => `<th>${day}</th>`).join('')}
                 </tr>
               </thead>
               <tbody>`;

    // Build table rows for each time slot.
    times.forEach(time => {
      html += `<tr><td>${time}</td>`;
      availableDays.forEach(day => {
        const details = resourceData[resource][day][time] || '';
        html += `<td>${details}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  }

  document.getElementById('resourceTimetableOutput').innerHTML = html;
}

// --- Event Listeners for the New Buttons ---
document.getElementById('displayFacultyTimetable').addEventListener('click', () => {
  if (generatedData) {
    renderFacultyTimetable(generatedData);
    document.getElementById('facultyTimetableOutput').scrollIntoView({ behavior: "smooth" });
  } else {
    alert("Please generate the timetable first.");
  }
});

document.getElementById('displayResourceTimetable').addEventListener('click', () => {
  if (generatedData) {
    renderResourceTimetable(generatedData);
    document.getElementById('resourceTimetableOutput').scrollIntoView({ behavior: "smooth" });
  } else {
    alert("Please generate the timetable first.");
  }
});

// --- Download Functions ---
function getTimetableDataForDownload() {
  return window.generatedData || JSON.parse(sessionStorage.getItem('timetableData'));
}

function downloadAsClassPDF() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/pdf?type=class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'class_timetable.pdf';
    a.click();
  });
}

function downloadAsFacultyPDF() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/pdf?type=faculty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'faculty_timetable.pdf';
    a.click();
  });
}

function downloadAsResourcePDF() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/pdf?type=resource', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resource_timetable.pdf';
    a.click();
  });
}

function downloadAsWord() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable.docx';
    a.click();
  });
}

function downloadAsExcel() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable.xlsx';
    a.click();
  });
}

function downloadAsJSON() {
  const data = getTimetableDataForDownload();
  if (!data) return alert('No timetable found.');
  fetch('/download/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.blob()).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable.json';
    a.click();
  });
}

// For backward compatibility with Customizer button if not updated
function downloadAsPDF() {
  downloadAsClassPDF();
}