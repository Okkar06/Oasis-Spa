# Sprint Planning

## Revenue Feature

### 1. Revenue Report - Inline Editing
**User Story:**
> "As a user (data admin), I want to click on any cell in the revenue report table and edit the value directly, so that I can quickly correct discrepancies or add missing data without navigating away from the report view."

**Acceptance Criteria:**
- [ ] Users can click on any editable cell (e.g., payment method amounts, VIP, Package) in the Revenue Report table.
- [ ] Clicking a cell converts it into an input field.
- [ ] Validations ensure only numeric values are entered.
- [ ] Changes are saved automatically (on blur or enter key) or via a save action.
- [ ] Totals (Daily, Monthly) automatically recalculate upon editing.

### 2. Revenue Report - Dynamic Payment Method Support
**User Story:**
> "As a user (data admin), I want newly added payment methods (e.g., CDC Vouchers) to automatically reflect in the Revenue Report as new columns, so that I can track revenue from all sources including new voucher types."

**Acceptance Criteria:**
- [ ] When a new Payment Method is added in the system (e.g., "CDC Vouchers"), a corresponding column automatically appears in the Revenue Report.
- [ ] The column supports data entry and aggregation like existing payment methods.
- [ ] Historic reports remain accurate even if payment methods change.

## Dashboard Feature

### 3. Dashboard UI/UX Improvements
**User Story:**
> "As a user (admin), I want an improved Dashboard with better layout and visualizations, so that I can get a clearer, more aesthetically pleasing overview of business performance."

**Acceptance Criteria:**
- [ ] Redesign the "Monthly Revenue", "Avg Transaction", and "Today's Appointments" cards for better readability and visual appeal.
- [ ] Improve the "Revenue Trend" chart (e.g., better tooltips, clearer axis labels, responsive sizing).
- [ ] Optimize the "Top Services" list presentation.
- [ ] Ensure the dashboard is responsive and looks good on different screen sizes.

## Quality Assurance & Testing

### 4. Revenue Report - E2E Testing
**User Story:**
> "As a developer, I want to implement automated End-to-End (E2E) tests for the Revenue Report, so that I can ensure the inline editing and dynamic payment method features work correctly and regressions are prevented."

**Acceptance Criteria:**
- [ ] Test that clicking a cell enables edit mode.
- [ ] Test that entering a value and saving updates the UI and persists data.
- [ ] Test that adding a new payment method dynamically adds a column to the report.
- [ ] Test calculation logic (daily/monthly totals) after edits.

### 5. Dashboard - E2E Testing
**User Story:**
> "As a developer, I want to implement automated End-to-End (E2E) tests for the Dashboard, so that I can verify that all charts, cards, and percentage indicators display the correct data and visual states."

**Acceptance Criteria:**
- [ ] Test that all dashboard cards (Revenue, Avg Transaction, etc.) load correctly.
- [ ] Verify that percentage growth indicators appear and show correct colors (green/red).
- [ ] Test that the "Revenue Trend" chart renders without errors.
- [ ] Verify responsiveness and layout integrity on different viewport sizes.
