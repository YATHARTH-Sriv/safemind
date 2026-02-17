import { jsPDF } from "jspdf";
import type {
    HealthPlan,
    HealthPlanDay,
    HealthPlanInput,
    HealthPlanTask,
    HealthPlanTemplateId,
} from "./types";

export const PLAN_TEMPLATES: Array<{ id: HealthPlanTemplateId; title: string; description: string }> = [
    {
        id: "weight-gain-8w",
        title: "8-week Clean Weight Gain Plan",
        description: "Structured nutrition, progressive training, recovery, and weekly check-ins.",
    },
    {
        id: "strength-8w",
        title: "8-week Strength Foundation Plan",
        description: "Progressive compound training with movement quality and recovery blocks.",
    },
    {
        id: "fat-loss-8w",
        title: "8-week Sustainable Fat Loss Plan",
        description: "Moderate deficit, step targets, resistance training, and habit consistency.",
    },
    {
        id: "anxiety-reset-14d",
        title: "14-day Anxiety Reset Plan",
        description: "Daily breathing, grounding, sleep hygiene, and reflection blocks.",
    },
    {
        id: "sleep-reset-14d",
        title: "14-day Sleep Recovery Plan",
        description: "Circadian reset routine with caffeine cutoffs and evening wind-down.",
    },
    {
        id: "mobility-reset-21d",
        title: "21-day Mobility & Posture Reset",
        description: "Daily mobility drills, posture breaks, and low-load movement therapy.",
    },
];

function makeTask(label: string): HealthPlanTask {
    return {
        id: crypto.randomUUID(),
        label,
        completed: false,
    };
}

function buildWeightGainDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 56; day += 1) {
        const week = Math.ceil(day / 7);
        const isDeload = week % 4 === 0;
        const dayInWeek = ((day - 1) % 7) + 1;
        const workoutDay = dayInWeek <= 5;
        const tasks = [
            makeTask("Hit calorie target (+300 to +500 surplus)"),
            makeTask("Consume 1.6-2.2g protein/kg bodyweight"),
            makeTask(workoutDay ? "Complete resistance training session" : "Active recovery walk (20-30 min)"),
            makeTask("Sleep at least 7.5 hours"),
            makeTask("Hydrate and log weight in tracker"),
        ];
        if (isDeload && workoutDay) {
            tasks.push(makeTask("Deload day: reduce volume by 30% and focus on form"));
        }
        days.push({
            day,
            title: `Week ${week}, Day ${dayInWeek}`,
            tasks,
        });
    }
    return days;
}

function buildAnxietyDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 14; day += 1) {
        days.push({
            day,
            title: `Day ${day}`,
            tasks: [
                makeTask("4-7-8 breathing, 4 rounds"),
                makeTask("5-minute grounding (5-4-3-2-1)"),
                makeTask("10-minute movement (walk/stretch)"),
                makeTask("Reduce caffeine after 2 PM"),
                makeTask("Evening journal: trigger + response + one adjustment"),
            ],
        });
    }
    return days;
}

function buildSleepDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 14; day += 1) {
        days.push({
            day,
            title: `Day ${day}`,
            tasks: [
                makeTask("Wake at fixed time (+/- 20 min)"),
                makeTask("Morning light exposure (10 min)"),
                makeTask("No caffeine after 2 PM"),
                makeTask("Screen dim + wind-down 60 min before bed"),
                makeTask("Bedroom cool/dark/quiet check"),
            ],
        });
    }
    return days;
}

function buildStrengthDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 56; day += 1) {
        const week = Math.ceil(day / 7);
        const dayInWeek = ((day - 1) % 7) + 1;
        const heavyDay = [1, 3, 5].includes(dayInWeek);
        const tasks = [
            makeTask(heavyDay ? "Primary lifts: squat/hinge/push at planned intensity" : "Technique + accessory session"),
            makeTask("Warm-up mobility (10 minutes) before lifting"),
            makeTask("Log sets, reps, and RPE"),
            makeTask("Protein target + hydration"),
            makeTask("Sleep at least 7 hours"),
        ];
        days.push({
            day,
            title: `Week ${week}, Day ${dayInWeek}`,
            tasks,
        });
    }
    return days;
}

function buildFatLossDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 56; day += 1) {
        const week = Math.ceil(day / 7);
        const dayInWeek = ((day - 1) % 7) + 1;
        const resistanceDay = [1, 3, 5].includes(dayInWeek);
        days.push({
            day,
            title: `Week ${week}, Day ${dayInWeek}`,
            tasks: [
                makeTask("Maintain moderate calorie deficit (300-500 kcal)"),
                makeTask("Hit daily step target (8k-10k steps)"),
                makeTask(resistanceDay ? "Complete resistance session" : "Low-intensity cardio or recovery walk"),
                makeTask("High-fiber meal plan adherence"),
                makeTask("Evening check-in: hunger, energy, sleep quality"),
            ],
        });
    }
    return days;
}

function buildMobilityDays(): HealthPlanDay[] {
    const days: HealthPlanDay[] = [];
    for (let day = 1; day <= 21; day += 1) {
        days.push({
            day,
            title: `Day ${day}`,
            tasks: [
                makeTask("10-minute thoracic + hip mobility flow"),
                makeTask("Two posture breaks every work block"),
                makeTask("Core stability drill (5-8 minutes)"),
                makeTask("Neck/shoulder decompression stretch"),
                makeTask("Daily movement log with pain/tension score"),
            ],
        });
    }
    return days;
}

function getTemplateMeta(templateId: HealthPlanTemplateId) {
    const match = PLAN_TEMPLATES.find((template) => template.id === templateId);
    return match ?? PLAN_TEMPLATES[0];
}

export function generateHealthPlan(input: HealthPlanInput): HealthPlan {
    const templateMeta = getTemplateMeta(input.templateId);
    let days: HealthPlanDay[];
    if (input.templateId === "weight-gain-8w") {
        days = buildWeightGainDays();
    } else if (input.templateId === "strength-8w") {
        days = buildStrengthDays();
    } else if (input.templateId === "fat-loss-8w") {
        days = buildFatLossDays();
    } else if (input.templateId === "anxiety-reset-14d") {
        days = buildAnxietyDays();
    } else if (input.templateId === "mobility-reset-21d") {
        days = buildMobilityDays();
    } else {
        days = buildSleepDays();
    }

    return {
        id: crypto.randomUUID(),
        templateId: input.templateId,
        title: templateMeta.title,
        createdAt: Date.now(),
        goal: input.goal.trim() || templateMeta.description,
        notes: input.profile.trim(),
        durationDays: days.length,
        days,
    };
}

export function planProgress(plan: HealthPlan) {
    const total = plan.days.reduce((sum, day) => sum + day.tasks.length, 0);
    const completed = plan.days.reduce(
        (sum, day) => sum + day.tasks.filter((task) => task.completed).length,
        0
    );
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percent };
}

export function planToMarkdown(plan: HealthPlan): string {
    const progress = planProgress(plan);
    const header = [
        `# ${plan.title}`,
        "",
        `Created: ${new Date(plan.createdAt).toLocaleString()}`,
        `Goal: ${plan.goal}`,
        `Progress: ${progress.completed}/${progress.total} tasks (${progress.percent}%)`,
        "",
        "## Profile Notes",
        plan.notes || "No profile notes provided.",
        "",
        "## Checklist",
        "",
    ];
    const sections = plan.days.map((day) => {
        const tasks = day.tasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.label}`).join("\n");
        return `### ${day.title}\n${tasks}`;
    });
    return [...header, ...sections].join("\n");
}

export function downloadPlanMarkdown(plan: HealthPlan) {
    const markdown = planToMarkdown(plan);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.title.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

export function downloadPlanPdf(plan: HealthPlan) {
    const doc = new jsPDF();
    const progress = planProgress(plan);
    const lines: string[] = [
        plan.title,
        `Goal: ${plan.goal}`,
        `Progress: ${progress.completed}/${progress.total} (${progress.percent}%)`,
        `Created: ${new Date(plan.createdAt).toLocaleString()}`,
        "",
        "Profile Notes:",
        plan.notes || "No profile notes provided.",
        "",
        "Checklist:",
    ];

    for (const day of plan.days) {
        lines.push("");
        lines.push(day.title);
        for (const task of day.tasks) {
            lines.push(`${task.completed ? "[x]" : "[ ]"} ${task.label}`);
        }
    }

    let y = 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const line of lines) {
        const wrapped = doc.splitTextToSize(line, 180);
        for (const w of wrapped) {
            if (y > 280) {
                doc.addPage();
                y = 14;
            }
            doc.text(w, 14, y);
            y += 6;
        }
    }

    doc.save(`${plan.title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
