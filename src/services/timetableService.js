/**
 * Helper function to normalize subject strings by removing whitespace
 * and converting to lowercase.
 */
function normalizeSubject(subject) {
    return subject.toLowerCase().replace(/\s+/g, '');
}

/**
 * Compare two subjects in a normalized manner.
 */
function subjectsMatch(subject1, subject2) {
    return normalizeSubject(subject1) === normalizeSubject(subject2);
}

// ----------------------
// Helper Functions
// ----------------------

// Shuffle an array using the Fisher-Yates algorithm.
function shuffleArray(array) {
    let arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Generate lecture slot timings from startTime to endTime while skipping breaks.
function generateSlotTimings(startTime, endTime, lectureDuration, breakTimes) {
    const slots = [];
    const lectureDurationMinutes = lectureDuration * 60;
    let currentTimeInMin =
        parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endTimeInMin =
        parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);

    const breaks = breakTimes.map(b => {
        return {
            start: parseInt(b.start.split(':')[0]) * 60 + parseInt(b.start.split(':')[1]),
            end: parseInt(b.end.split(':')[0]) * 60 + parseInt(b.end.split(':')[1])
        };
    }).sort((a, b) => a.start - b.start);

    let breakIndex = 0;
    while (currentTimeInMin + lectureDurationMinutes <= endTimeInMin) {
        if (
            breakIndex < breaks.length &&
            currentTimeInMin >= breaks[breakIndex].start &&
            currentTimeInMin < breaks[breakIndex].end
        ) {
            currentTimeInMin = breaks[breakIndex].end;
            breakIndex++;
            continue;
        }
        if (
            breakIndex < breaks.length &&
            currentTimeInMin < breaks[breakIndex].start &&
            currentTimeInMin + lectureDurationMinutes > breaks[breakIndex].start
        ) {
            currentTimeInMin = breaks[breakIndex].end;
            breakIndex++;
            continue;
        }
        const slotStart = currentTimeInMin;
        const slotEnd = currentTimeInMin + lectureDurationMinutes;
        slots.push({
            start: `${Math.floor(slotStart / 60).toString().padStart(2, '0')}:${(slotStart % 60).toString().padStart(2, '0')}`,
            end: `${Math.floor(slotEnd / 60).toString().padStart(2, '0')}:${(slotEnd % 60).toString().padStart(2, '0')}`
        });
        currentTimeInMin = slotEnd;
        if (breakIndex < breaks.length && currentTimeInMin === breaks[breakIndex].start) {
            currentTimeInMin = breaks[breakIndex].end;
            breakIndex++;
        }
    }
    return slots;
}

// Create a blank timetable object for every class, day, and lecture slot.
function createBlankTimetables(classes, days, slotTimings) {
    const timetable = {};
    classes.forEach(cls => {
        timetable[cls.className] = {};
        days.forEach(day => {
            timetable[cls.className][day] = slotTimings.map(slot => ({
                time: slot,
                lecture: null
            }));
        });
    });
    return timetable;
}

// Initialize resource availability (for faculties, rooms, labs) as arrays of 0's.
function initializeAvailability(resources, days, totalSlots) {
    const availability = {};
    resources.forEach(resource => {
        availability[resource] = {};
        days.forEach(day => {
            availability[resource][day] = Array(totalSlots).fill(0);
        });
    });
    return availability;
}

// Build a subject→lab mapping from user-defined lab configs.
// labConfigs: [{ labName: "Lab 1", subjects: ["OS Lab", "DBMS Lab"] }, ...]
// allPracticalSubjects: flat array of all unique practical subject names
// Rules:
//   - Subjects explicitly listed under a lab → only that lab
//   - Labs with empty subjects array → "Any Lab" pool for unassigned subjects
//   - If no "Any Lab" labs exist → all labs share unassigned subjects round-robin
function buildSubjectToLabMappingFromConfigs(labConfigs, allPracticalSubjects) {
    const mapping = {};
    const anyLabPool = [];

    labConfigs.forEach(lab => {
        lab.subjects.forEach(subject => {
            mapping[normalizeSubject(subject)] = lab.labName;
        });
        if (lab.subjects.length === 0) {
            anyLabPool.push(lab.labName);
        }
    });

    // Prefer "Any Lab" labs for unassigned subjects; fall back to all labs
    const pool = anyLabPool.length > 0 ? anyLabPool : labConfigs.map(l => l.labName);
    let poolIndex = 0;

    allPracticalSubjects.forEach(subject => {
        const key = normalizeSubject(subject);
        if (!mapping[key] && pool.length > 0) {
            mapping[key] = pool[poolIndex % pool.length];
            poolIndex++;
        }
    });

    return mapping;
}

// Assign labs to practical subjects using a round-robin random approach.
function assignLabsToSubjects(classes, labs) {
    let subjectToLabMapping = {};
    let practicalSubjectsSet = new Set();
    classes.forEach(cls => {
        cls.practicalSubjects.forEach(subject => {
            practicalSubjectsSet.add(normalizeSubject(subject));
        });
    });
    const subjectsArray = Array.from(practicalSubjectsSet);
    let labPool = labs.slice();
    subjectsArray.forEach(subject => {
        if (labPool.length === 0) {
            labPool = labs.slice();
        }
        const randomIndex = Math.floor(Math.random() * labPool.length);
        subjectToLabMapping[subject] = labPool[randomIndex];
        labPool.splice(randomIndex, 1);
    });
    return subjectToLabMapping;
}

// Helper function to choose the best faculty for a given slot based on compactness.
function findBestFacultyForSlot(candidateFaculties, day, slotIndex, facultyAvailability) {
    let bestFaculty = null;
    let bestScore = Infinity;

    candidateFaculties.forEach(faculty => {
        const schedule = facultyAvailability[faculty.facultyName][day];

        if ((slotIndex > 0 && schedule[slotIndex - 1] === 1) ||
            (slotIndex < schedule.length - 1 && schedule[slotIndex + 1] === 1)) {
            bestFaculty = faculty;
            bestScore = 0;
            return;
        }

        let minGap = Infinity;
        for (let i = 0; i < schedule.length; i++) {
            if (schedule[i] === 1) {
                const gap = Math.abs(i - slotIndex);
                if (gap < minGap) {
                    minGap = gap;
                }
            }
        }

        if (minGap < bestScore) {
            bestScore = minGap;
            bestFaculty = faculty;
        }
    });

    return bestFaculty;
}

// Revised Timetable Generation Logic with Relaxed Compact Scheduling
function generateTimetable(
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
    subjectToLabMapping = null
) {
    const roomKeys = Object.keys(roomAvailability);
    let fixedRoomMapping = {};
    if (classes.length === roomKeys.length || classes.length <= roomKeys.length) {
        classes.forEach((cls, index) => {
            fixedRoomMapping[cls.className] = roomKeys[index];
        });
    }
    const labsArray = Object.keys(labAvailability);
    if (!subjectToLabMapping) {
        subjectToLabMapping = assignLabsToSubjects(classes, labsArray);
    }

    // const subjectToLabMapping = assignLabsToSubjects(classes, labsArray);

    classes.forEach(cls => {
        days.forEach(day => {
            for (let slot = 0; slot < slotTimings.length; slot++) {
                if (timetable[cls.className][day][slot].lecture !== null) continue;

                const allSubjects = cls.theorySubjects.concat(cls.practicalSubjects);
                const subjectsToTry = shuffleArray(allSubjects);
                let assigned = false;

                for (const subject of subjectsToTry) {
                    const subjectAssignedCount = timetable[cls.className][day].filter(
                        slotObj => slotObj.lecture && subjectsMatch(slotObj.lecture.subject, subject)
                    ).length;
                    if (subjectAssignedCount >= maxSubjectLecturesPerDay) continue;

                    const subjectKey = Object.keys(cls.subjectWeeklyHours).find(key =>
                        subjectsMatch(key, subject)
                    );
                    if (!subjectKey || cls.subjectWeeklyHours[subjectKey] < lectureDuration) continue;

                    const candidateFaculties = faculties.filter(faculty => {
                        const canTeach =
                            faculty.theorySubjects.some(fs => subjectsMatch(fs, subject)) ||
                            faculty.practicalSubjects.some(fs => subjectsMatch(fs, subject));
                        if (!canTeach) return false;
                        if (facultyAvailability[faculty.facultyName][day][slot] !== 0) return false;
                        const dailyWorkload = facultyAvailability[faculty.facultyName][day].filter(s => s === 1).length;
                        return dailyWorkload < maxFacultyLecturesPerDay;
                    });

                    let selectedFaculty = null;
                    if (candidateFaculties.length > 0) {
                        selectedFaculty = findBestFacultyForSlot(candidateFaculties, day, slot, facultyAvailability);
                    }
                    if (!selectedFaculty && candidateFaculties.length > 0) {
                        selectedFaculty = candidateFaculties[0];
                    }

                    if (!selectedFaculty) {
                        // console.warn(`No available faculty for subject ${subject} in class ${cls.className} on ${day} at slot ${slot}.`);
                        continue;
                    }

                    let availableResource = null;
                    const isPractical = cls.practicalSubjects.some(ps => subjectsMatch(ps, subject));
                    if (isPractical) {
                        const normalizedSubject = normalizeSubject(subject);
                        const assignedLab = subjectToLabMapping[normalizedSubject];
                        if (!assignedLab || labAvailability[assignedLab][day][slot] !== 0) {
                            // console.warn(`Assigned lab ${assignedLab} for practical subject ${subject} in class ${cls.className} is not available on ${day} at slot ${slot}.`);
                            continue;
                        }
                        availableResource = assignedLab;
                    } else {
                        if (Object.keys(fixedRoomMapping).length > 0) {
                            availableResource = fixedRoomMapping[cls.className];
                            if (roomAvailability[availableResource][day][slot] !== 0) {
                                // console.warn(`Fixed room ${availableResource} for class ${cls.className} is not available on ${day} at slot ${slot}.`);
                                continue;
                            }
                        } else {
                            availableResource = Object.keys(roomAvailability).find(
                                room => roomAvailability[room][day][slot] === 0
                            );
                            if (!availableResource) {
                                // console.warn(`No available room for theory subject ${subject} in class ${cls.className} on ${day} at slot ${slot}.`);
                                continue;
                            }
                        }
                    }

                    timetable[cls.className][day][slot].lecture = {
                        subject,
                        faculty: selectedFaculty.facultyName,
                        venue: availableResource,
                        time: timetable[cls.className][day][slot].time
                    };

                    facultyAvailability[selectedFaculty.facultyName][day][slot] = 1;
                    if (isPractical) {
                        labAvailability[availableResource][day][slot] = 1;
                    } else {
                        roomAvailability[availableResource][day][slot] = 1;
                    }

                    cls.subjectWeeklyHours[subjectKey] -= lectureDuration;
                    assigned = true;
                    break;
                }

                if (!assigned) {
                    // console.warn(`No available subject/faculty could be assigned for class ${cls.className} on ${day} at slot ${slot}.`);
                }
            }
        });
    });

    return { timetable, subjectToLabMapping };

}

// Utility: Build table data from the generated timetable (for the main timetable only).
// We iterate over each class in timetable and for each class, we assume all days have the same number of slots.
function buildTableData(timetable) {
    let tables = []; // one per class
    for (let className in timetable) {
        const classTable = { className, header: [], rows: [] };
        const fixedDayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const days = fixedDayOrder.filter(day => timetable[className].hasOwnProperty(day));

        classTable.header = ['Time', ...days];
        // Determine maximum number of slots among days.
        let maxSlots = 0;
        days.forEach(day => {
            maxSlots = Math.max(maxSlots, timetable[className][day].length);
        });
        for (let i = 0; i < maxSlots; i++) {
            let row = [];
            // Use first day's slot for time if available.
            if (timetable[className][days[0]][i]) {
                row.push(`${timetable[className][days[0]][i].time.start} - ${timetable[className][days[0]][i].time.end}`);
            } else {
                row.push('');
            }
            days.forEach(day => {
                if (timetable[className][day][i]) {
                    const lecture = timetable[className][day][i].lecture;
                    if (lecture) {
                        row.push(`${lecture.subject}\n${lecture.faculty}\n${lecture.venue}`);
                    } else {
                        row.push('');
                    }
                } else {
                    row.push('');
                }
            });
            classTable.rows.push(row);
        }
        tables.push(classTable);
    }
    return tables;
}

// Utility: Build table data for Faculty Timetables
function buildFacultyTableData(facultyTimetable) {
    const tables = [];
    const fixedDayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const facultyName in facultyTimetable) {
        const schedule = facultyTimetable[facultyName];
        const availableDays = fixedDayOrder.filter(day => schedule.hasOwnProperty(day));

        // Find all unique times across all days
        const timeSet = new Set();
        availableDays.forEach(day => {
            Object.keys(schedule[day]).forEach(time => timeSet.add(time));
        });

        // Simple string sort for "HH:MM - HH:MM" usually works for chronological order if format is 24h/consistent padded
        const times = Array.from(timeSet).sort((a, b) => {
            const [aStart] = a.split(' - ');
            const [bStart] = b.split(' - ');
            return aStart.localeCompare(bStart);
        });

        const rows = [];
        times.forEach(time => {
            const row = [time]; // First column is time
            availableDays.forEach(day => {
                row.push(schedule[day][time] || '');
            });
            rows.push(row);
        });

        tables.push({
            title: `Faculty: ${facultyName}`, // Generic 'title' property instead of 'className'
            header: ['Time', ...availableDays],
            rows: rows
        });
    }
    return tables;
}

// Utility: Build table data for Resource Timetables
function buildResourceTableData(resourceTimetable) {
    const tables = [];
    const fixedDayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const resourceName in resourceTimetable) {
        const schedule = resourceTimetable[resourceName];
        const availableDays = fixedDayOrder.filter(day => schedule.hasOwnProperty(day));

        const timeSet = new Set();
        availableDays.forEach(day => {
            Object.keys(schedule[day]).forEach(time => timeSet.add(time));
        });

        const times = Array.from(timeSet).sort((a, b) => {
            const [aStart] = a.split(' - ');
            const [bStart] = b.split(' - ');
            return aStart.localeCompare(bStart);
        });

        const rows = [];
        times.forEach(time => {
            const row = [time];
            availableDays.forEach(day => {
                row.push(schedule[day][time] || '');
            });
            rows.push(row);
        });

        tables.push({
            title: resourceName,   // raw name (e.g. "Classroom1", "Lab 1") – caller adds prefix
            header: ['Time', ...availableDays],
            rows: rows
        });
    }
    return tables;
}

// Utility: Derive Faculty and Resource timetables from the Class Timetable
// labNamesInput can be:
//   - an array of strings (new API): ["Lab 1", "Networking Lab", ...]
//   - a number (legacy API): 3  → generates ["Lab1", "Lab2", "Lab3"]
function deriveDerivedTimetables(classTimetable, faculties, numberOfRooms, labNamesInput) {
    const facultyTimetable = {};
    // Initialize faculty entries
    faculties.forEach(faculty => {
        facultyTimetable[faculty.facultyName] = {};
    });

    const resourceTimetable = {};
    const rooms = Array.from({ length: numberOfRooms }, (_, i) => `Classroom${i + 1}`);
    const labs = Array.isArray(labNamesInput)
        ? labNamesInput
        : Array.from({ length: labNamesInput || 0 }, (_, i) => `Lab${i + 1}`);

    // Initialize resource entries
    rooms.forEach(room => {
        resourceTimetable[room] = {};
    });
    labs.forEach(lab => {
        resourceTimetable[lab] = {};
    });

    for (const className in classTimetable) {
        for (const day in classTimetable[className]) {
            classTimetable[className][day].forEach(slotObj => {
                if (slotObj.lecture) {
                    const timeLabel = `${slotObj.time.start} - ${slotObj.time.end}`;
                    const { subject, faculty, venue } = slotObj.lecture;

                    // Update Faculty Timetable
                    if (facultyTimetable[faculty]) {
                        if (!facultyTimetable[faculty][day]) {
                            facultyTimetable[faculty][day] = {};
                        }
                        facultyTimetable[faculty][day][timeLabel] = `${subject} - ${className}`;
                    }

                    // Update Resource Timetable
                    if (resourceTimetable[venue]) {
                        if (!resourceTimetable[venue][day]) {
                            resourceTimetable[venue][day] = {};
                        }
                        resourceTimetable[venue][day][timeLabel] = `${subject} - ${className} - ${faculty}`;
                    }
                }
            });
        }
    }

    return { facultyTimetable, resourceTimetable };
}

module.exports = {
    generateSlotTimings,
    createBlankTimetables,
    initializeAvailability,
    assignLabsToSubjects,
    buildSubjectToLabMappingFromConfigs,
    generateTimetable,
    buildTableData,
    buildFacultyTableData,
    buildResourceTableData,
    deriveDerivedTimetables,
    subjectsMatch,
    normalizeSubject
};