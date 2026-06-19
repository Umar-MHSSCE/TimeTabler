// ══════════════════════════════════════════════════════════════
//  tt_hero.js v3 — muted navy palette + 3D tilt
// ══════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", function () {

    var TIMES = [
        "10:00–11:00","11:00–12:00","12:00–13:00",
        "13:00–14:00",
        "14:00–15:00","15:00–16:00","16:00–17:00"
    ];

    var SCHED = [
        [
            {s:"DS",          v:"Classroom1", f:"Waheeda mam", c:"tt-c-nav"},
            {s:"Python",       v:"Classroom1", f:"Bali sir",    c:"tt-c-mid"},
            {s:"MP lab",       v:"Lab1",       f:"Nafisa mam",  c:"tt-c-acc"},
            {s:"Data Struct.", v:"Classroom1", f:"Bali sir",    c:"tt-c-nav"},
            {s:"CG",           v:"Classroom1", f:"Nafisa mam",  c:"tt-c-nav"},
            {s:"DS",           v:"Classroom1", f:"Waheeda mam", c:"tt-c-nav"}
        ],
        [
            {s:"AOA lab",      v:"Lab3",       f:"Lutful sir",  c:"tt-c-slt"},
            {s:"AOA lab",      v:"Lab3",       f:"Lutful sir",  c:"tt-c-slt"},
            {s:"OOP Java",     v:"Classroom1", f:"Fatima mam",  c:"tt-c-mid"},
            {s:"Database Lab", v:"Lab2",       f:"Bali sir",    c:"tt-c-acc"},
            {s:"OS",           v:"Classroom1", f:"Farhana mam", c:"tt-c-slt"},
            {s:"DS",           v:"Classroom1", f:"Waheeda mam", c:"tt-c-nav"}
        ],
        [
            {s:"CG",           v:"Classroom1", f:"Nafisa mam",  c:"tt-c-nav"},
            {s:"OOP Java",     v:"Classroom1", f:"Fatima mam",  c:"tt-c-mid"},
            {s:"OS lab",       v:"Lab3",       f:"Farhana mam", c:"tt-c-slt"},
            {s:"CG lab",       v:"Lab1",       f:"Nafisa mam",  c:"tt-c-nav"},
            {s:"Python",       v:"Classroom1", f:"Bali sir",    c:"tt-c-mid"},
            {s:"Database Lab", v:"Lab2",       f:"Bali sir",    c:"tt-c-acc"}
        ],
        "break",
        [
            {s:"OS",           v:"Classroom1", f:"Farhana mam", c:"tt-c-slt"},
            {s:"DS lab",       v:"Lab2",       f:"Waheeda mam", c:"tt-c-nav"},
            {s:"MP",           v:"Classroom1", f:"Nafisa mam",  c:"tt-c-acc"},
            {s:"Python",       v:"Classroom1", f:"Bali sir",    c:"tt-c-mid"},
            {s:"MP",           v:"Classroom1", f:"Nafisa mam",  c:"tt-c-acc"},
            {s:"OS",           v:"Classroom1", f:"Farhana mam", c:"tt-c-slt"}
        ],
        [
            {s:"DS",           v:"Classroom1", f:"Waheeda mam", c:"tt-c-nav"},
            {s:"OOP Java",     v:"Classroom1", f:"Fatima mam",  c:"tt-c-mid"},
            {s:"AOA",          v:"Classroom1", f:"Lutful sir",  c:"tt-c-slt"},
            {s:"AOA",          v:"Classroom1", f:"Lutful sir",  c:"tt-c-slt"},
            {s:"OS",           v:"Classroom1", f:"Farhana mam", c:"tt-c-slt"},
            {s:"DS lab",       v:"Lab2",       f:"Waheeda mam", c:"tt-c-nav"}
        ],
        [
            {s:"MP lab",       v:"Lab1",       f:"Nafisa mam",  c:"tt-c-acc"},
            {s:"CG lab",       v:"Lab1",       f:"Nafisa mam",  c:"tt-c-nav"},
            {s:"Data Struct.", v:"Classroom1", f:"Bali sir",    c:"tt-c-nav"},
            {s:"CG",           v:"Classroom1", f:"Nafisa mam",  c:"tt-c-nav"},
            {s:"OS lab",       v:"Lab3",       f:"Farhana mam", c:"tt-c-slt"},
            {s:"Python",       v:"Classroom1", f:"Bali sir",    c:"tt-c-mid"}
        ]
    ];

    var STATUSES = [
        "Analyzing faculty availability\u2026",
        "Mapping subject requirements\u2026",
        "Resolving time conflicts\u2026",
        "Optimizing lecture density\u2026",
        "Assigning venues & labs\u2026",
        "Finalizing timetable\u2026"
    ];

    var tbody  = document.getElementById("ttHeroBody");
    var statEl = document.getElementById("ttHeroStatus");
    var badge  = document.getElementById("ttHeroBadge");
    if (!tbody || !statEl || !badge) return;

    var timer = null;
    var allCells = [];

    function buildDOM() {
        tbody.innerHTML = "";
        allCells = [];
        SCHED.forEach(function (row, r) {
            var tr = document.createElement("tr");
            var td0 = document.createElement("td");
            td0.className = "tt-td-time";
            td0.textContent = TIMES[r];
            tr.appendChild(td0);

            if (row === "break") {
                for (var c = 0; c < 6; c++) {
                    var b = document.createElement("td");
                    b.className = "tt-td-break";
                    b.textContent = "Break";
                    tr.appendChild(b);
                }
            } else {
                var rowCells = [];
                row.forEach(function (d) {
                    var td = document.createElement("td");
                    td.className = "tt-td-cell";
                    td.dataset.d = JSON.stringify(d);
                    tr.appendChild(td);
                    rowCells.push(td);
                });
                allCells.push(rowCells);
            }
            tbody.appendChild(tr);
        });
    }

    function run() {
        clearTimeout(timer);
        badge.classList.remove("show");
        statEl.className     = "tt-hero-status";
        statEl.style.opacity = "1";
        statEl.textContent   = STATUSES[0];

        buildDOM();
        var flat = allCells.reduce(function (a, b) { return a.concat(b); }, []);
        var i = 0, si = 0;

        function step() {
            if (i > 0) flat[i - 1].classList.remove("tt-scanning");
            if (i >= flat.length) {
                statEl.style.opacity = "0";
                timer = setTimeout(function () {
                    statEl.className     = "tt-hero-status tt-done";
                    statEl.textContent   = "Schedule complete";
                    statEl.style.opacity = "1";
                    badge.classList.add("show");
                }, 350);
                timer = setTimeout(run, 6500);
                return;
            }
            if (i % 5 === 0 && si < STATUSES.length) {
                statEl.textContent = STATUSES[si++];
            }
            var cell = flat[i];
            var d    = JSON.parse(cell.dataset.d);
            cell.classList.add("tt-scanning");
            var delay = i < 4 ? 340 : i < 18 ? 165 : 85;
            timer = setTimeout(function () {
                cell.classList.remove("tt-scanning");
                cell.classList.add("tt-placed", d.c);
                cell.innerHTML =
                    '<div class="tt-cell-inner">' +
                        '<span class="tt-cell-subj">'  + d.s + '</span>' +
                        '<span class="tt-cell-venue">\uD83D\uDCCD' + d.v + '</span>' +
                        '<span class="tt-cell-fac">\uD83D\uDC64'   + d.f + '</span>' +
                    '</div>' +
                    '<div class="tt-shimmer-layer"></div>';
                i++;
                step();
            }, delay);
        }
        step();
    }

    run();
});