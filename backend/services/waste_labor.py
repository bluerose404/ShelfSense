"""
Milestone 6: Waste Log, Korean Labor Standards Act Schedule Draft & Early-Cut Simulator Service
- Pure functions for:
  1. Canonical Labor Budget & Peak Staffing Fixture:
     - Sales ₩4,000,000, 30% target = ₩1,200,000 budget
     - 92-hour draft at ₩12,000 = ₩1,104,000 = 27.6%
     - 48 covers/hour at 14 covers per staff -> 4 front staff
  2. Korean Labor Standards Act (근로기준법) compliance checks:
     - 2026 minimum wage (₩10,320/hr)
     - Break rules (4h -> 30m, 8h -> 60m)
     - Weekly hours cap (staff max_weekly_hours & 52h statutory limit)
     - 주휴수당 (Weekly Holiday Allowance at >= 15h/week threshold)
     - 5+ employee overtime/night/holiday 1.5x multipliers
  3. Early-Cut Simulator for slow-demand shifts
- Database helpers for WasteLog (with FEFO lot depletion & AuditLog) and Weekly Labor Schedule Draft.
"""
import json
import math
from datetime import date, datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from backend.models import (
    Ingredient, Lot, WasteLog, StaffMember, ShiftRecord, SystemSetting, AuditLog
)


LABOR_DISCLAIMER_KO = (
    "본 인건비 및 주휴수당 수치는 스케줄링 참고용 추정치이며, 실제 급여 정산·지급 또는 세무/노무 자문 효력이 없습니다."
)
LABOR_DISCLAIMER_EN = (
    "All labor cost and allowance figures are scheduling estimates only and do not execute real payroll or constitute legal advice."
)


def compute_labor_budget_and_peak_staffing(
    projected_sales_krw: float,
    target_labor_pct: float,
    draft_hours: float,
    avg_hourly_wage_krw: float,
    peak_covers_per_hour: float,
    covers_per_staff_per_hour: float = 14.0,
) -> Dict[str, Any]:
    """
    Pure function for the canonical Labor Budget & Peak Staffing Fixture (AGENTS.md):
    - Sales: ₩4,000,000, 30% target (0.30 or 30.0) = ₩1,200,000 budget
    - Draft: 92 hours * ₩12,000 = ₩1,104,000 = 27.6%
    - Peak Front Staffing: 48 covers/hour at 14 per staff -> ceil(48 / 14) = 4 front staff
    """
    pct_ratio = float(target_labor_pct) / 100.0 if target_labor_pct > 1.0 else float(target_labor_pct)
    labor_budget_krw = round(float(projected_sales_krw) * pct_ratio)
    draft_cost_krw = round(float(draft_hours) * float(avg_hourly_wage_krw))
    draft_labor_pct = (
        round((draft_cost_krw / float(projected_sales_krw)) * 100.0, 2)
        if projected_sales_krw > 0
        else 0.0
    )
    budget_remaining_krw = labor_budget_krw - draft_cost_krw
    peak_front_staff = (
        int(math.ceil(float(peak_covers_per_hour) / float(covers_per_staff_per_hour) - 1e-9))
        if peak_covers_per_hour > 0 and covers_per_staff_per_hour > 0
        else 0
    )

    return {
        "projected_sales_krw": round(float(projected_sales_krw)),
        "target_labor_pct": round(pct_ratio * 100.0, 2),
        "labor_budget_krw": labor_budget_krw,
        "draft_hours": round(float(draft_hours), 2),
        "avg_hourly_wage_krw": round(float(avg_hourly_wage_krw)),
        "draft_cost_krw": draft_cost_krw,
        "draft_labor_pct": draft_labor_pct,
        "budget_remaining_krw": budget_remaining_krw,
        "within_budget": draft_cost_krw <= labor_budget_krw,
        "peak_covers_per_hour": round(float(peak_covers_per_hour), 2),
        "covers_per_staff_per_hour": round(float(covers_per_staff_per_hour), 2),
        "peak_front_staff": peak_front_staff,
    }


def check_korean_labor_rules(
    hourly_wage_krw: float,
    shift_duration_hours: float,
    break_minutes: int,
    weekly_paid_hours: float,
    max_weekly_hours: float = 40.0,
    min_wage_krw: float = 10320.0,
    has_5_plus_employees: bool = True,
    overtime_hours: float = 0.0,
    night_hours: float = 0.0,
    holiday_hours: float = 0.0,
) -> Dict[str, Any]:
    """
    Pure function: Evaluates Korean Labor Standards Act (근로기준법) rules for a staff schedule:
    1. 2026 Minimum Wage check (>= ₩10,320/hr)
    2. Statutory rest break check (4h -> >=30m, 8h -> >=60m)
    3. Weekly hours cap check (<= max_weekly_hours and <= 52h)
    4. 주휴수당 (Weekly Holiday Allowance) eligibility & estimate at >= 15h/week
    5. 5+ employee premium multiplier (1.5x for overtime/night/holiday)
    """
    violations: List[str] = []
    warnings: List[str] = []

    # 1. Minimum wage check
    min_wage_ok = float(hourly_wage_krw) >= float(min_wage_krw)
    if not min_wage_ok:
        violations.append(
            f"Minimum wage violation: ₩{hourly_wage_krw:,.0f}/hr < statutory ₩{min_wage_krw:,.0f}/hr"
        )

    # 2. Break rule check (근로기준법 제54조)
    if shift_duration_hours >= 8.0:
        required_break_minutes = 60
    elif shift_duration_hours >= 4.0:
        required_break_minutes = 30
    else:
        required_break_minutes = 0

    break_ok = int(break_minutes) >= required_break_minutes
    if not break_ok:
        violations.append(
            f"Rest break violation: {shift_duration_hours}h shift requires >= {required_break_minutes}m break (scheduled {break_minutes}m)"
        )

    # 3. Weekly hours cap check
    weekly_cap_ok = float(weekly_paid_hours) <= float(max_weekly_hours) and float(weekly_paid_hours) <= 52.0
    if float(weekly_paid_hours) > 52.0:
        violations.append(f"Statutory 52h weekly cap exceeded ({weekly_paid_hours}h)")
    elif float(weekly_paid_hours) > float(max_weekly_hours):
        warnings.append(
            f"Contract weekly hours ({max_weekly_hours}h) exceeded: scheduled {weekly_paid_hours}h"
        )

    # 4. 주휴수당 (Weekly Holiday Allowance — >= 15.0 hours/week)
    juhyu_eligible = float(weekly_paid_hours) >= 15.0
    if juhyu_eligible:
        juhyu_hours = (min(float(weekly_paid_hours), 40.0) / 40.0) * 8.0
        juhyu_allowance_krw = round(juhyu_hours * float(hourly_wage_krw))
        if 15.0 <= float(weekly_paid_hours) <= 17.0:
            warnings.append(
                f"주휴수당 threshold crossed ({weekly_paid_hours}h >= 15h/wk): adds ₩{juhyu_allowance_krw:,}"
            )
    else:
        juhyu_hours = 0.0
        juhyu_allowance_krw = 0

    # 5. 5+ employees premium multiplier (overtime, night, holiday = +50% premium per category)
    premium_rate = 0.5 if has_5_plus_employees else 0.0
    premium_hours_equiv = (float(overtime_hours) + float(night_hours) + float(holiday_hours)) * premium_rate
    premium_pay_krw = round(premium_hours_equiv * float(hourly_wage_krw))
    base_pay_krw = round(float(weekly_paid_hours) * float(hourly_wage_krw))
    total_estimated_weekly_pay_krw = base_pay_krw + juhyu_allowance_krw + premium_pay_krw

    return {
        "min_wage_ok": min_wage_ok,
        "required_break_minutes": required_break_minutes,
        "break_ok": break_ok,
        "weekly_cap_ok": weekly_cap_ok,
        "juhyu_eligible": juhyu_eligible,
        "juhyu_allowance_krw": juhyu_allowance_krw,
        "has_5_plus_employees": has_5_plus_employees,
        "premium_pay_krw": premium_pay_krw,
        "base_pay_krw": base_pay_krw,
        "total_estimated_weekly_pay_krw": total_estimated_weekly_pay_krw,
        "violations": violations,
        "warnings": warnings,
    }


def simulate_early_cut(
    projected_covers_per_hour: float,
    actual_covers_per_hour: float,
    scheduled_front_staff: int,
    covers_per_staff_per_hour: float = 14.0,
    cut_hours: float = 1.5,
    hourly_wage_krw: float = 10500.0,
    staff_current_weekly_hours: float = 16.0,
    min_staff_floor: int = 2,
) -> Dict[str, Any]:
    """
    Pure function: Simulates cutting front-of-house staff early during a slow shift.
    Calculates required staff for `actual_covers_per_hour`, recommended early cuts
    (respecting `min_staff_floor`), direct wage savings, and any 주휴수당 threshold impact.
    """
    needed_for_actual = (
        int(math.ceil(float(actual_covers_per_hour) / float(covers_per_staff_per_hour) - 1e-9))
        if actual_covers_per_hour > 0
        else min_staff_floor
    )
    recommended_active_staff = max(int(min_staff_floor), needed_for_actual)
    removable_staff_count = max(0, int(scheduled_front_staff) - recommended_active_staff)

    direct_wage_saved_krw = round(removable_staff_count * float(cut_hours) * float(hourly_wage_krw))

    new_weekly_hours = max(0.0, round(float(staff_current_weekly_hours) - float(cut_hours), 2))
    crossed_below_juhyu = float(staff_current_weekly_hours) >= 15.0 and new_weekly_hours < 15.0
    juhyu_saved_krw = (
        round((min(float(staff_current_weekly_hours), 40.0) / 40.0) * 8.0 * float(hourly_wage_krw))
        if (removable_staff_count > 0 and crossed_below_juhyu)
        else 0
    )

    return {
        "projected_covers_per_hour": round(float(projected_covers_per_hour), 1),
        "actual_covers_per_hour": round(float(actual_covers_per_hour), 1),
        "scheduled_front_staff": int(scheduled_front_staff),
        "recommended_active_staff": recommended_active_staff,
        "removable_staff_count": removable_staff_count,
        "cut_hours": round(float(cut_hours), 2),
        "direct_wage_saved_krw": direct_wage_saved_krw,
        "crossed_below_15h_juhyu": crossed_below_juhyu,
        "juhyu_saved_krw": juhyu_saved_krw,
        "total_estimated_savings_krw": direct_wage_saved_krw + juhyu_saved_krw,
    }


def get_waste_logs_and_summary(session: Session, limit: int = 40) -> Dict[str, Any]:
    ingredients = {i.id: i for i in session.exec(select(Ingredient)).all()}
    all_logs = session.exec(select(WasteLog).order_by(WasteLog.log_datetime.desc())).all()

    by_reason: Dict[str, float] = {}
    by_ingredient: Dict[int, float] = {}
    total_waste_krw = 0.0

    for w in all_logs:
        total_waste_krw += w.cost_krw
        by_reason[w.reason] = round(by_reason.get(w.reason, 0.0) + w.cost_krw)
        by_ingredient[w.ingredient_id] = round(by_ingredient.get(w.ingredient_id, 0.0) + w.cost_krw)

    recent_items = []
    for w in all_logs[:limit]:
        ing = ingredients.get(w.ingredient_id)
        recent_items.append({
            "id": w.id,
            "log_datetime": w.log_datetime.isoformat(),
            "ingredient_id": w.ingredient_id,
            "ingredient_code": ing.code if ing else None,
            "ingredient_name_ko": ing.name_ko if ing else "알 수 없음",
            "ingredient_name_en": ing.name_en if ing else "Unknown",
            "unit": ing.unit if ing else "kg",
            "lot_id": w.lot_id,
            "quantity": w.quantity,
            "cost_krw": round(w.cost_krw),
            "reason": w.reason,
            "notes": w.notes,
        })

    return {
        "total_waste_krw": round(total_waste_krw),
        "total_logs_count": len(all_logs),
        "by_reason_krw": by_reason,
        "recent_logs": recent_items,
    }


def record_waste_event(
    session: Session,
    ingredient_id: int,
    quantity: float,
    reason: str,
    notes: str = "",
    lot_id: Optional[int] = None,
) -> Dict[str, Any]:
    ing = session.get(Ingredient, ingredient_id)
    if not ing:
        raise ValueError(f"Ingredient {ingredient_id} not found")
    if quantity <= 0:
        raise ValueError("Waste quantity must be > 0")

    # Deplete from specified lot or in FEFO order from active lots
    rem = round(float(quantity), 4)
    used_lot_id = lot_id

    if lot_id:
        target_lot = session.get(Lot, lot_id)
        if target_lot and target_lot.status == "active":
            deducted = min(target_lot.quantity, rem)
            target_lot.quantity = round(target_lot.quantity - deducted, 4)
            if target_lot.quantity <= 1e-6:
                target_lot.quantity = 0.0
                target_lot.status = "depleted"
            session.add(target_lot)
    else:
        active_lots = session.exec(
            select(Lot)
            .where(Lot.ingredient_id == ingredient_id, Lot.status == "active")
            .order_by(Lot.expiry_date.asc(), Lot.received_date.asc(), Lot.id.asc())
        ).all()
        for l in active_lots:
            if rem <= 0:
                break
            if used_lot_id is None:
                used_lot_id = l.id
            deducted = min(l.quantity, rem)
            l.quantity = round(l.quantity - deducted, 4)
            rem = round(rem - deducted, 4)
            if l.quantity <= 1e-6:
                l.quantity = 0.0
                l.status = "depleted"
            session.add(l)

    cost_krw = round(float(quantity) * ing.unit_cost_krw)
    w_log = WasteLog(
        log_datetime=datetime(2026, 11, 4, 9, 0, 0, tzinfo=timezone.utc),
        ingredient_id=ing.id,
        lot_id=used_lot_id,
        quantity=round(float(quantity), 4),
        cost_krw=cost_krw,
        reason=reason,
        notes=notes,
    )
    session.add(w_log)

    audit = AuditLog(
        action="waste_logged",
        entity_type="WasteLog",
        details_json=json.dumps({
            "ingredient_code": ing.code,
            "quantity": round(float(quantity), 4),
            "cost_krw": cost_krw,
            "reason": reason,
            "lot_id": used_lot_id,
        }),
    )
    session.add(audit)
    session.commit()
    session.refresh(w_log)

    return {
        "id": w_log.id,
        "ingredient_id": ing.id,
        "ingredient_code": ing.code,
        "ingredient_name_ko": ing.name_ko,
        "ingredient_name_en": ing.name_en,
        "unit": ing.unit,
        "lot_id": w_log.lot_id,
        "quantity": w_log.quantity,
        "cost_krw": w_log.cost_krw,
        "reason": w_log.reason,
        "notes": w_log.notes,
    }


def generate_weekly_labor_draft(session: Session) -> Dict[str, Any]:
    """
    Generates the weekly labor schedule draft & Korean Labor Standards Act audit
    for the demo week (Mon 2026-11-02 to Sun 2026-11-08), plus the canonical
    budget & peak staffing summary.
    """
    settings = {s.key: s.value for s in session.exec(select(SystemSetting)).all()}
    min_wage_krw = float(settings.get("min_wage_krw", "10320"))
    target_labor_pct = float(settings.get("target_labor_pct", "30"))
    has_5_plus = settings.get("has_5_plus_employees", "true").lower() == "true"

    staff_list = session.exec(select(StaffMember).order_by(StaffMember.id.asc())).all()

    # Deterministic weekly shift plan per staff role
    role_weekly_plan = {
        "kitchen": {"days": 5, "shift_hours": 8.0, "break_minutes": 60, "overtime_hours": 0.0},
        "prep": {"days": 5, "shift_hours": 6.0, "break_minutes": 30, "overtime_hours": 0.0},
        "server": {"days": 4, "shift_hours": 4.0, "break_minutes": 30, "overtime_hours": 0.0},
        "dishwasher": {"days": 3, "shift_hours": 4.5, "break_minutes": 30, "overtime_hours": 0.0},
    }

    staff_rows: List[Dict[str, Any]] = []
    total_draft_hours = 0.0
    total_estimated_cost_krw = 0

    for st in staff_list:
        plan = role_weekly_plan.get(st.role, {"days": 4, "shift_hours": 5.0, "break_minutes": 30, "overtime_hours": 0.0})
        paid_per_shift = plan["shift_hours"] - (plan["break_minutes"] / 60.0)
        weekly_paid_hours = round(plan["days"] * paid_per_shift, 2)

        rule_check = check_korean_labor_rules(
            hourly_wage_krw=st.hourly_wage_krw,
            shift_duration_hours=plan["shift_hours"],
            break_minutes=plan["break_minutes"],
            weekly_paid_hours=weekly_paid_hours,
            max_weekly_hours=st.max_weekly_hours,
            min_wage_krw=min_wage_krw,
            has_5_plus_employees=has_5_plus,
            overtime_hours=plan["overtime_hours"],
        )

        total_draft_hours = round(total_draft_hours + weekly_paid_hours, 2)
        total_estimated_cost_krw += rule_check["total_estimated_weekly_pay_krw"]

        staff_rows.append({
            "staff_id": st.id,
            "name_ko": st.name_ko,
            "name_en": st.name_en,
            "role": st.role,
            "employment_type": st.employment_type,
            "hourly_wage_krw": st.hourly_wage_krw,
            "max_weekly_hours": st.max_weekly_hours,
            "scheduled_days": plan["days"],
            "shift_duration_hours": plan["shift_hours"],
            "break_minutes": plan["break_minutes"],
            "weekly_paid_hours": weekly_paid_hours,
            **rule_check,
        })

    # Include the canonical fixture summary alongside the live roster draft
    canonical_fixture = compute_labor_budget_and_peak_staffing(
        projected_sales_krw=4000000,
        target_labor_pct=target_labor_pct,
        draft_hours=92.0,
        avg_hourly_wage_krw=12000.0,
        peak_covers_per_hour=48.0,
        covers_per_staff_per_hour=14.0,
    )

    return {
        "disclaimer_ko": LABOR_DISCLAIMER_KO,
        "disclaimer_en": LABOR_DISCLAIMER_EN,
        "min_wage_krw": min_wage_krw,
        "target_labor_pct": target_labor_pct,
        "has_5_plus_employees": has_5_plus,
        "canonical_budget_summary": canonical_fixture,
        "roster_total_hours": total_draft_hours,
        "roster_total_estimated_cost_krw": total_estimated_cost_krw,
        "staff_schedule": staff_rows,
    }
