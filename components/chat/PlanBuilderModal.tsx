"use client";

import { useState } from "react";
import type { HealthPlanTemplateId } from "@/lib/types";

export function PlanBuilderModal({
    open,
    initialTemplateId,
    templates,
    onClose,
    onCreatePlan,
}: {
    open: boolean;
    initialTemplateId: HealthPlanTemplateId;
    templates: Array<{ id: HealthPlanTemplateId; title: string; description: string }>;
    onClose: () => void;
    onCreatePlan: (input: { templateId: HealthPlanTemplateId; profile: string; goal: string }) => void;
}) {
    const [templateId, setTemplateId] = useState<HealthPlanTemplateId>(initialTemplateId);
    const [profile, setProfile] = useState("");
    const [goal, setGoal] = useState("");

    if (!open) return null;

    return (
        <div className="sm-modal-overlay" onClick={onClose}>
            <div className="sm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
                <div className="sm-modal-header">
                    <span className="sm-modal-title">Create Daily Health Plan</span>
                    <button className="sm-modal-close" type="button" onClick={onClose}>✕</button>
                </div>
                <div className="sm-modal-body">
                    <label className="sm-field-label">
                        Template
                        <select
                            className="sm-input"
                            value={templateId}
                            onChange={(e) => setTemplateId(e.target.value as HealthPlanTemplateId)}
                        >
                            {templates.map((template) => (
                                <option key={template.id} value={template.id}>
                                    {template.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="sm-modal-copy">
                        {templates.find((template) => template.id === templateId)?.description}
                    </p>
                    <label className="sm-field-label">
                        Profile context
                        <textarea
                            className="sm-input sm-plan-textarea"
                            value={profile}
                            onChange={(e) => setProfile(e.target.value)}
                            placeholder="Example: 70kg, 175cm, beginner gym level, vegetarian, lactose sensitive."
                        />
                    </label>
                    <label className="sm-field-label">
                        Goal
                        <input
                            className="sm-input"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            placeholder="Example: Gain 5kg clean muscle in 2 months."
                        />
                    </label>
                    <div className="sm-modal-actions">
                        <button className="sm-btn sm-btn-ghost" type="button" onClick={onClose}>Cancel</button>
                        <button
                            className="sm-btn sm-btn-solid"
                            type="button"
                            onClick={() => onCreatePlan({ templateId, profile, goal })}
                        >
                            Generate Plan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
