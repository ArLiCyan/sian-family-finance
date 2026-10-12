-- Loans can be paid weekly, monthly (default) or yearly. The expected payment
-- amount and the schedule follow that frequency; "months left" is always
-- shown in months, converted from the number of payments still to go.

alter table public.debts
  add column if not exists payment_frequency text not null default 'monthly'
  check (payment_frequency in ('weekly', 'monthly', 'yearly'));

create or replace view public.debt_payoff_projection with (security_invoker = true) as
 SELECT d.id AS debt_id,
    db.remaining_amount,
    GREATEST(d.original_amount - db.remaining_amount, 0::numeric) AS total_paid,
    d.installment_amount,
    COALESCE(d.installment_amount, avg_calc.monthly_rate) AS effective_monthly_rate,
    d.installment_amount IS NULL AND avg_calc.monthly_rate IS NOT NULL AS is_estimated_rate,
        CASE
            WHEN db.remaining_amount <= 0::numeric THEN 0
            WHEN pr.periods IS NULL THEN NULL::integer
            WHEN d.installment_amount IS NULL THEN pr.periods
            WHEN d.payment_frequency = 'weekly' THEN ceil(pr.periods * 12 / 52.0)::integer
            WHEN d.payment_frequency = 'yearly' THEN pr.periods * 12
            ELSE pr.periods
        END AS months_remaining,
        CASE
            WHEN db.remaining_amount <= 0::numeric THEN NULL::date
            WHEN pr.periods IS NULL THEN NULL::date
            WHEN d.installment_amount IS NOT NULL AND d.payment_frequency = 'weekly' THEN (CURRENT_DATE + pr.periods * 7)
            WHEN d.installment_amount IS NOT NULL AND d.payment_frequency = 'yearly' THEN (CURRENT_DATE + (pr.periods || ' years')::interval)::date
            ELSE (CURRENT_DATE + (pr.periods || ' months')::interval)::date
        END AS projected_payoff_date
   FROM debts d
     JOIN debt_balances db ON db.debt_id = d.id
     LEFT JOIN ( SELECT debt_payments.debt_id,
            sum(debt_payments.amount) / GREATEST(EXTRACT(year FROM age(max(debt_payments.date)::timestamp with time zone, min(debt_payments.date)::timestamp with time zone)) * 12::numeric + EXTRACT(month FROM age(max(debt_payments.date)::timestamp with time zone, min(debt_payments.date)::timestamp with time zone)) + 1::numeric, 1::numeric) AS monthly_rate
           FROM debt_payments
          GROUP BY debt_payments.debt_id) avg_calc ON avg_calc.debt_id = d.id
     CROSS JOIN LATERAL ( SELECT CASE
            WHEN COALESCE(d.installment_amount, avg_calc.monthly_rate) > 0::numeric
            THEN ceil(db.remaining_amount / COALESCE(d.installment_amount, avg_calc.monthly_rate))::integer
            ELSE NULL::integer
        END AS periods) pr;
