const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require("nodemailer");
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

// Import libraries for downloads
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } = require('docx');
const ExcelJS = require('exceljs');
const {
  generateTimetable,
  generateSlotTimings,
  createBlankTimetables,
  initializeAvailability,
  buildSubjectToLabMappingFromConfigs,
  buildTableData,
  buildFacultyTableData,
  buildResourceTableData,
  deriveDerivedTimetables
} = require('./src/services/timetableService');

app.use(express.json());


const sessionMiddleware = session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
  unset: 'destroy'
});

app.use(sessionMiddleware);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landingpage.html'));
});

app.get('/workspace', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, 'public')));



// Logic moved to src/services/timetableService.js

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/submit_message", async (req, res) => {
  // console.log(req.body);
  const { "full-name": fullName, email, message } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"TimeTabler Contact" <${process.env.EMAIL_USER}>`,  // must be your own Gmail
      to: process.env.EMAIL_USER,
      replyTo: `"${fullName}" <${email}>`,  // ← user's email goes here
      subject: `New Contact Message from ${fullName}`,
      html: `
    <h3>New Contact Form Submission</h3>
    <p><strong>Name:</strong> ${fullName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong></p>
    <p>${message}</p>
  `
    });

    // res.send("Message sent successfully!");
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to send message");
  }
});


app.post('/generateTimetable', (req, res) => {

  const {
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
    numberOfLabs,       // legacy fallback (kept for backward compat)
    labConfigs,         // new: [{ labName, subjects[] }]
    saturdayEnabled,
    saturdayStartTime,
    saturdayEndTime,
    saturdayBreakTimes
  } = req.body;

  // Derive lab names: prefer labConfigs (new), fall back to numberOfLabs (legacy)
  const labNames = labConfigs && labConfigs.length > 0
    ? labConfigs.map(l => l.labName)
    : Array.from({ length: numberOfLabs || 0 }, (_, i) => `Lab${i + 1}`);

  let days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const slotTimings = generateSlotTimings(startTime, endTime, lectureDuration, breakTimes);
  if (slotTimings.length <= 0) {
    return res.status(400).json({
      error: 'No valid lecture slots could be generated. Check your timings and breaks.'
    });
  }

  const timetable = createBlankTimetables(classes, days, slotTimings);
  const totalSlots = slotTimings.length;
  const facultyAvailability = initializeAvailability(
    faculties.map(f => f.facultyName),
    days,
    totalSlots
  );

  const rooms = Array.from({ length: numberOfRooms }, (_, i) => `Classroom${i + 1}`);
  const roomAvailability = initializeAvailability(rooms, days, totalSlots);
  const labAvailability = initializeAvailability(labNames, days, totalSlots);

  // Build subject→lab mapping from labConfigs (or fall back to random assignment)
  let subjectToLabMapping = null;
  if (labConfigs && labConfigs.length > 0) {
    const allPracticalSubjects = [...new Set(classes.flatMap(c => c.practicalSubjects))];
    subjectToLabMapping = buildSubjectToLabMappingFromConfigs(labConfigs, allPracticalSubjects);
  }

  const result = generateTimetable(
    timetable,
    facultyAvailability,
    roomAvailability,
    labAvailability,
    classes,
    faculties,
    slotTimings,
    days,
    lectureDuration,
    maxFacultyLecturesPerDay,
    maxSubjectLecturesPerDay,
    subjectToLabMapping
  );
  const generatedTimetable = result.timetable;
  const finalSubjectToLabMapping = result.subjectToLabMapping;

  let saturdayNeeded = false;
  if (saturdayEnabled) {
    saturdayNeeded = true;
  } else {
    classes.forEach(cls => {
      for (let subj in cls.subjectWeeklyHours) {
        if (cls.subjectWeeklyHours[subj] > 0) {
          saturdayNeeded = true;
        }
      }
    });
  }

  if (saturdayNeeded) {
    let satStart = (saturdayEnabled && saturdayStartTime) ? saturdayStartTime : startTime;
    let satEnd = (saturdayEnabled && saturdayEndTime) ? saturdayEndTime : endTime;
    const saturdaySlots = generateSlotTimings(satStart, satEnd, lectureDuration,
      (saturdayBreakTimes && saturdayBreakTimes.length > 0) ? saturdayBreakTimes : breakTimes);

    faculties.forEach(faculty => {
      facultyAvailability[faculty.facultyName]['Saturday'] = Array(saturdaySlots.length).fill(0);
    });
    Object.keys(roomAvailability).forEach(room => {
      roomAvailability[room]['Saturday'] = Array(saturdaySlots.length).fill(0);
    });
    Object.keys(labAvailability).forEach(lab => {
      labAvailability[lab]['Saturday'] = Array(saturdaySlots.length).fill(0);
    });

    classes.forEach(cls => {
      generatedTimetable[cls.className]['Saturday'] = saturdaySlots.map(slot => ({
        time: slot,
        lecture: null
      }));
    });

    generateTimetable(
      generatedTimetable,
      facultyAvailability,
      roomAvailability,
      labAvailability,
      classes,
      faculties,
      saturdaySlots,
      ['Saturday'],
      lectureDuration,
      maxFacultyLecturesPerDay,
      maxSubjectLecturesPerDay,
      finalSubjectToLabMapping
    );
    days.push('Saturday');
  }

  // Build faculty and resource timetables using actual lab names
  const { facultyTimetable, resourceTimetable } = deriveDerivedTimetables(
    generatedTimetable,
    faculties,
    numberOfRooms,
    labNames
  );

  const output = {
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
    numberOfLabs: labNames.length,   // keep for legacy compat
    labConfigs: labConfigs || null,
    labNames,
    saturdayEnabled,
    saturdayStartTime,
    saturdayEndTime,
    saturdayBreakTimes,
    timetable: generatedTimetable,
    facultyTimetable,
    resourceTimetable
  };


  // Store the generated timetable in session for download endpoints.
  req.session.generatedTimetable = output;

  res.json(output);
});

// ----------------------
// Download Endpoints
// ----------------------

// buildTableData moved to src/services/timetableService.js

// PDF Download: Generate timetable tables in PDF.
app.post('/download/pdf', (req, res) => {
  try {
    const timetableData = req.body;
    const type = req.query.type || 'class'; // 'class', 'faculty', 'resource'

    let tables = [];
    let titleStr = '';
    let filenameStr = 'timetable.pdf';

    if (type === 'faculty') {
      tables = buildFacultyTableData(timetableData.facultyTimetable);
      titleStr = 'Faculty Timetable';
      filenameStr = 'faculty_timetable.pdf';
    } else if (type === 'resource') {
      tables = buildResourceTableData(timetableData.resourceTimetable);
      titleStr = 'Resource Timetable';
      filenameStr = 'resource_timetable.pdf';
    } else {
      tables = buildTableData(timetableData.timetable);
      titleStr = 'Class Timetable';
      filenameStr = 'class_timetable.pdf';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filenameStr}"`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).text(titleStr, { align: 'center' }).moveDown();

    let isFirst = true;

    tables.forEach(table => {
      // Logic to handle both 'className' (from class TT) and 'title' (from faculty/resource TT)
      const tableTitle = table.className ? `Class: ${table.className}` : table.title;

      if (!isFirst) {
        doc.addPage();
      }
      isFirst = false;

      doc.fontSize(14).text(tableTitle, { underline: true }).moveDown(0.5);

      const startX = 50;
      let currentY = doc.y;
      const rowHeight = 50;
      const timeColumnWidth = 80;
      const totalWidth = doc.page.width - 100;
      const otherColumnWidth = (totalWidth - timeColumnWidth) / (table.header.length - 1);

      // Draw header row
      let offset = 0;
      table.header.forEach((header, i) => {
        const colWidth = i === 0 ? timeColumnWidth : otherColumnWidth;
        doc.rect(startX + offset, currentY, colWidth, rowHeight).stroke();
        doc.fontSize(10).text(header, startX + offset + 5, currentY + 12, {
          width: colWidth - 10,
          align: 'center'
        });
        offset += colWidth;
      });
      currentY += rowHeight;

      // Draw data rows
      table.rows.forEach(row => {
        offset = 0;
        row.forEach((cell, i) => {
          const colWidth = i === 0 ? timeColumnWidth : otherColumnWidth;
          doc.rect(startX + offset, currentY, colWidth, rowHeight).stroke();
          // Adjust font size if text is long
          const fontSize = cell.length > 50 ? 8 : 9;
          doc.fontSize(fontSize).text(cell, startX + offset + 4, currentY + 8, {
            width: colWidth - 8,
            align: 'center'
          });
          offset += colWidth;
        });
        currentY += rowHeight;

        // Add new page if close to bottom
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }
      });

      doc.moveDown(2);
    });

    doc.end();

  } catch (error) {
    res.status(500).send(error.message);
  }
});


// Word Download: Generate timetable tables in a Word document.
app.post('/download/word', async (req, res) => {
  try {
    const timetableData = req.body;
    const tables = buildTableData(timetableData.timetable);

    const children = [
      new Paragraph({ children: [new TextRun({ text: "Timetable", bold: true, size: 28 })] }),
      new Paragraph("")
    ];

    tables.forEach(table => {
      children.push(new Paragraph({ text: `Class: ${table.className}`, spacing: { after: 200 }, underline: {} }));
      const tableRows = [];
      tableRows.push(new TableRow({
        children: table.header.map(cell => new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: cell, bold: true })] })],
        }))
      }));
      table.rows.forEach(row => {
        tableRows.push(new TableRow({
          children: row.map((cell, i) => new TableCell({
            width: i === 0
              ? { size: 15, type: WidthType.PERCENTAGE }
              : { size: 85 / (row.length - 1), type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: cell })] })]
          }))
        }));
      });

      children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      children.push(new Paragraph(""));
    });

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Disposition', 'attachment; filename="timetable.docx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);

  } catch (error) {
    res.status(500).send(error.message);
  }
});


// Excel Download: Generate timetable tables in Excel.
app.post('/download/excel', async (req, res) => {
  try {
    const timetableData = req.body;
    const tables = buildTableData(timetableData.timetable);

    const workbook = new ExcelJS.Workbook();

    tables.forEach(table => {
      const sheet = workbook.addWorksheet(table.className);

      // Add header row
      sheet.addRow(table.header);

      // Add timetable rows
      table.rows.forEach(row => {
        sheet.addRow(row);
      });

      // Set column widths (Time column narrower, others wider)
      sheet.columns = table.header.map((_, i) => ({
        width: i === 0 ? 15 : 25
      }));

      // Format all rows (wrap text + center alignment)
      sheet.eachRow((row, rowNumber) => {
        row.eachCell(cell => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
          };
        });

        // Bold and format header row
        if (rowNumber === 1) {
          row.font = { bold: true };
          row.height = 25; // Optional: taller header row
        } else {
          row.height = 50; // Optional: consistent row height for data
        }
      });

      // Optional: Freeze top row for better UX
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    res.setHeader('Content-Disposition', 'attachment; filename="timetable.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    res.status(500).send(error.message);
  }
});


app.post('/download/json', (req, res) => {
  try {
    const timetableData = req.body;

    const jsonBuffer = Buffer.from(JSON.stringify(timetableData, null, 2));

    res.setHeader('Content-Disposition', 'attachment; filename="timetable.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(jsonBuffer);
  } catch (error) {
    res.status(500).send(error.message);
  }
});


// Endpoint to get current session ID (for debugging/verification)
app.get('/sessionInfo', (req, res) => {
  res.json({ sessionID: req.sessionID });
});

// Regenerate from uploaded/edited JSON settings
function generateFromSettings(settings) {
  const {
    department, classes, faculties, startTime, endTime,
    lectureDuration, breakTimes, maxFacultyLecturesPerDay,
    maxSubjectLecturesPerDay, numberOfRooms, numberOfLabs,
    saturdayEnabled, saturdayStartTime, saturdayEndTime, saturdayBreakTimes
  } = settings;

  let days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slotTimings = generateSlotTimings(startTime, endTime, lectureDuration, breakTimes);
  if (slotTimings.length === 0) throw new Error("No valid slots");

  const timetable = createBlankTimetables(classes, days, slotTimings);
  const facultyAvailability = initializeAvailability(faculties.map(f => f.facultyName), days, slotTimings.length);
  const rooms = Array.from({ length: numberOfRooms }, (_, i) => `Classroom${i + 1}`);
  const labs = Array.from({ length: numberOfLabs }, (_, i) => `Lab${i + 1}`);
  const roomAvailability = initializeAvailability(rooms, days, slotTimings.length);
  const labAvailability = initializeAvailability(labs, days, slotTimings.length);

  const { timetable: finalTable, subjectToLabMapping } = generateTimetable(
    timetable, facultyAvailability, roomAvailability, labAvailability,
    classes, faculties, slotTimings, days, lectureDuration,
    maxFacultyLecturesPerDay, maxSubjectLecturesPerDay
  );

  // Reuse your existing logic here to build:
  const facultyTimetable = {};
  const resourceTimetable = {};

  for (const className in finalTable) {
    for (const day in finalTable[className]) {
      finalTable[className][day].forEach(slotObj => {
        if (slotObj.lecture) {
          const timeLabel = `${slotObj.time.start} - ${slotObj.time.end}`;
          const { subject, faculty, venue } = slotObj.lecture;

          if (!facultyTimetable[faculty]) facultyTimetable[faculty] = {};
          if (!facultyTimetable[faculty][day]) facultyTimetable[faculty][day] = {};
          facultyTimetable[faculty][day][timeLabel] = `${subject} - ${className}`;

          if (!resourceTimetable[venue]) resourceTimetable[venue] = {};
          if (!resourceTimetable[venue][day]) resourceTimetable[venue][day] = {};
          resourceTimetable[venue][day][timeLabel] = `${subject} - ${className} - ${faculty}`;
        }
      });
    }
  }

  return {
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
    saturdayEnabled,
    saturdayStartTime,
    saturdayEndTime,
    saturdayBreakTimes,
    timetable: finalTable,
    facultyTimetable,
    resourceTimetable,
    breakTimes,
    saturdayBreakTimes
  };
}

app.post('/updateTimetable', (req, res) => {
  const settings = req.body;

  try {
    // Support both labNames array (new) and numberOfLabs number (legacy)
    const labNamesOrCount = settings.labNames || settings.numberOfLabs;

    const { facultyTimetable, resourceTimetable } = deriveDerivedTimetables(
      settings.timetable,
      settings.faculties,
      settings.numberOfRooms,
      labNamesOrCount
    );
    settings.facultyTimetable = facultyTimetable;
    settings.resourceTimetable = resourceTimetable;

    req.session.generatedTimetable = settings;
    
    res.json(settings);
  } catch (err) {
    console.error("Save failed:", err);
    res.status(500).send("Save failed: " + err.message);
  }
});


// Final step: server start
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});