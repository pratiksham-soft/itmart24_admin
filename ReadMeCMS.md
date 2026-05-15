# ITMart24 Admin CMS User Manual

This document explains how to use the main CMS and CRM features inside the ITMart24 Admin system.

It is written for daily users such as admins, marketing team members, CRM operators, content managers, and email campaign users.

---

# 1. Getting Started

## How to log in

1. Open the ITMart24 Admin panel in your browser.
2. Enter your admin email and password.
3. Click the login button.
4. After successful login, you will land on the dashboard or the last active admin page.

## What you see after login

After login, the left sidebar is the main navigation area. From there you can open:

- Dashboard
- CRM
- Email Manager
- Blog Manager
- Marketing tools
- Reports and other admin modules

---

# 2. How to Use the Sidebar

1. Use the left sidebar to move between modules.
2. Click a menu item once to open it.
3. If a menu has sub-items, click the parent menu to expand it.
4. For CRM, click the `CRM` menu and choose the required section:
   - CRM Dashboard
   - Leads
   - Contacts
   - Companies
   - Deals / Pipeline
   - Tasks & Follow-ups
   - Activities
   - Email Campaigns
   - Segments
   - Reports
   - CRM Settings

---

# 3. How to Use CRM Dashboard

The CRM Dashboard gives a quick overview of the CRM system.

## What you can see

- Total leads
- New leads
- Qualified leads
- Active deals
- Won deals
- Lost deals
- Pending follow-ups
- Overdue tasks
- Campaign statistics
- Recent CRM activity

## Steps

1. Open `CRM > CRM Dashboard`.
2. Review the summary cards at the top.
3. Check recent activity to understand what changed recently.
4. Use the quick actions if available to create a lead, contact, company, deal, task, or campaign.
5. Use the dashboard regularly to monitor sales and outreach progress.

---

# 4. How to Use Leads

Leads are the main starting point for CRM activity.

## How to open Leads

1. Open `CRM > Leads`.

## How to search leads

1. Use the search box at the top of the page.
2. Search by:
   - name
   - email
   - phone
   - company
   - source

## How to filter leads

1. Use the filters above the leads table.
2. Filter by:
   - status
   - source
   - priority
   - owner if available

## How to add a lead

1. Click `Add Lead`.
2. Fill in lead details such as:
   - first name
   - last name
   - email
   - phone
   - company name
   - job title
   - lead source
   - priority
   - estimated value
3. Save the form.

## How to edit a lead

1. Find the lead in the table.
2. Click the edit action.
3. Update the information.
4. Save changes.

## How to view a lead

1. Click the view action on any lead.
2. Review the tabs inside the lead details:
   - Overview
   - Activities
   - Tasks
   - Deals
   - Notes

## How to delete a lead

1. Click the delete action.
2. Review the confirmation message carefully.
3. Confirm deletion only if you are sure.

## How to convert a lead

1. Open the lead details.
2. Click `Convert Lead`.
3. The system can create related CRM records such as contact, company, and optionally a deal.

---

# 5. How to Import Leads

The import feature helps you add many leads at once using a CSV file.

## Steps

1. Open `CRM > Leads`.
2. Click `Import Leads`.
3. Download the sample CSV file first.
4. Keep the CSV column names unchanged.
5. Fill the CSV file with lead data.
6. Upload the CSV file inside the import modal.
7. Choose the duplicate handling option:
   - Skip existing leads by email
   - Update existing leads by email
   - Allow duplicates
8. Keep `Create activity logs` checked if you want import actions to appear in CRM activity.
9. Click `Preview Import`.
10. Review:
    - total rows
    - valid rows
    - invalid rows
    - duplicate rows
    - rows to create
    - rows to update
    - rows to skip
11. If the preview looks correct, click `Import Leads`.
12. Wait for the import result summary.

## Important notes

- Only CSV files are allowed.
- File size should be within the allowed limit.
- Invalid rows will be skipped.
- Leads without valid emails may not be eligible for email campaigns later.

---

# 6. How to Use Contacts

Contacts are people linked to business relationships such as vendors, customers, partners, or prospects.

## Steps

1. Open `CRM > Contacts`.
2. Use search and filters to find the contact you need.
3. Click `Add Contact` to create a new one.
4. Link the contact to a company where possible.
5. Add notes and follow-up tasks as needed.
6. Use the contact history to track communication.

---

# 7. How to Use Companies

Companies help organize leads and contacts by organization.

## Steps

1. Open `CRM > Companies`.
2. Click `Add Company`.
3. Fill in:
   - name
   - website
   - country
   - city
   - company size
   - owner
   - status
4. Save the company.
5. Open the company view to review linked contacts, leads, and deals.

---

# 8. How to Use Deals / Pipeline

Deals represent active revenue opportunities.

## Steps

1. Open `CRM > Deals / Pipeline`.
2. Create a deal manually or from lead conversion.
3. Set:
   - deal title
   - linked lead/contact/company
   - stage
   - value
   - probability
   - expected close date
4. Update the stage as the opportunity moves forward.
5. Mark deals as won or lost when completed.

---

# 9. How to Use Tasks & Follow-ups

Tasks help teams follow up on leads, contacts, and deals.

## Steps

1. Open `CRM > Tasks & Follow-ups`.
2. Create a task for calls, emails, meetings, demos, proposals, or reminders.
3. Set the due date and assigned owner.
4. Filter tasks by:
   - My Tasks
   - Today
   - Upcoming
   - Overdue
   - Completed
5. Mark tasks as completed once finished.

---

# 10. How to Use Activities

The Activities page gives a timeline of CRM events.

## Steps

1. Open `CRM > Activities`.
2. Use filters to narrow down activity by type or entity.
3. Search activity notes if needed.
4. Review actions such as:
   - lead created
   - lead updated
   - lead converted
   - campaign created
   - campaign sent
   - task completed

---

# 11. How to Use Email Manager

Email Manager is used to configure the email accounts that power direct email and campaigns.

## What Email Manager is for

- connecting email accounts
- sending one-to-one emails
- managing inbox folders
- reading sent and received emails
- testing SMTP and IMAP configuration

## How to add an email account

1. Open `Marketing > Email Manager`.
2. Click to add a new account.
3. Enter:
   - display name
   - email address
   - username
   - password
   - IMAP host and port
   - SMTP host and port
   - secure settings
4. Save the account.
5. Use `Test Connection` to verify both IMAP and SMTP are working.
6. Mark the account as default if needed.

## How to send a normal email

1. Open Email Manager.
2. Select a configured email account.
3. Click compose.
4. Enter recipient email, subject, and message.
5. Add attachments if needed.
6. Click send.

## Important note

Email Campaigns use these configured Email Manager accounts as sender accounts. If no active email account exists, campaigns cannot be sent.

---

# 12. How to Use Email Campaign

This is the main bulk email workflow for CRM leads.

## What Email Campaign is used for

- vendor outreach
- partner outreach
- product listing outreach
- subscription reminders
- follow-up communication to CRM leads

## Before you start

Make sure the following are ready:

1. At least one active sender account exists in Email Manager.
2. Your CRM leads contain valid email addresses.
3. You know the audience you want to contact.
4. Your subject line and message are business-relevant and professional.

## How to create a campaign draft

1. Open `CRM > Email Campaigns`.
2. Click `Create Campaign`.
3. Enter the campaign name.
4. In the top section of the campaign form, use the `Sender Account` dropdown.
5. The `Sender Account` dropdown appears beside the campaign name and delay/body mode fields.
6. If the dropdown is empty or not useful yet, first go to `Marketing > Email Manager` and add at least one active email account.
7. After an email account is added and active, return to `CRM > Email Campaigns` and open `Create Campaign` again.
5. Enter the email subject.
6. Choose the body mode:
   - HTML editor with preview
   - Plain text
7. Write the message body.
8. Set the delay between emails.
   - Recommended default is 10 seconds.
9. Select CRM lead recipients.
10. Save the campaign draft.

## How to select recipients

1. Use the recipient search box to find leads by:
   - name
   - company
   - email
   - website
   - tags
2. Use filters for:
   - lead status
   - priority
   - tags
   - assigned owner if available
   - company name
3. Select individual recipients one by one, or use `Select All Filtered`.
4. Review the selected recipients panel before saving.

## How to use personalization tokens

You can insert tokens into the subject and body.

Available tokens:

- `{{firstName}}`
- `{{lastName}}`
- `{{companyName}}`
- `{{jobTitle}}`
- `{{website}}`
- `{{email}}`

## Example

Subject:

`Hello {{firstName}}, partnership opportunity with ITMart24`

Body:

`<p>Hello {{firstName}},</p><p>We would love to speak with {{companyName}} about listing opportunities on ITMart24.</p>`

## How to preview the email

1. In the campaign composer, select one of the chosen recipients in the preview section.
2. Review the rendered subject and body.
3. Make sure tokens are replaced correctly.

## How to send a test email

1. Save the campaign draft first.
2. Open the campaign details.
3. Enter a test email address.
4. Click `Send Test`.
5. Review the received test message.

## How to send the real campaign

1. Make sure the campaign is still in Draft status.
2. Click `Send Draft`.
3. Review the confirmation modal carefully:
   - sender account
   - total recipients
   - delay
   - estimated total duration
   - subject preview
4. Click the confirmation button to start sending.

## What happens during sending

1. The campaign status changes to `Sending`.
2. Emails are sent one by one.
3. The backend waits for the configured delay between emails.
4. Each recipient gets a status:
   - pending
   - sending
   - sent
   - failed
   - skipped
   - cancelled if the campaign is stopped
5. The campaign detail view updates progress over time.

## How to monitor progress

1. Open the campaign details.
2. Review:
   - total recipients
   - sent count
   - failed count
   - pending count
   - progress bar
   - recipient-level delivery status
3. If any recipient fails, review the error message shown in the delivery table.

## How to cancel a sending campaign

1. Open the campaign row while its status is `Sending`.
2. Click `Cancel`.
3. The system will stop the campaign safely on the next processing cycle.

## How to duplicate a completed or old campaign

1. Open the Email Campaigns table.
2. Click `Duplicate` on the campaign you want to reuse.
3. A new draft copy will be created.
4. Edit the subject, body, sender, recipients, or delay as needed.
5. Save and send the duplicate draft.

---

# 13. How to Read Campaign Statuses

## Draft

The campaign is saved but has not started sending yet.

## Sending

The campaign is actively sending emails in sequence.

## Completed

The campaign finished processing all recipients.

## Failed

The campaign could not complete properly or all sends failed.

## Cancelled

The campaign was stopped before finishing.

---

# 14. Best Practices for Email Campaigns

1. Use clear and honest subject lines.
2. Send only to relevant business contacts.
3. Test the email before full sending.
4. Keep the delay enabled to reduce spam risk and throttling.
5. Personalize using tokens where helpful.
6. Review failed recipients after each campaign.
7. Duplicate old campaigns instead of re-sending completed ones directly.

---

# 15. Troubleshooting

## Campaign cannot be sent

Possible reasons:

- no active sender account in Email Manager
- no valid recipients selected
- missing campaign subject
- missing campaign body
- invalid sender account

## Some recipients failed

Possible reasons:

- invalid destination email
- SMTP/server rejection
- temporary provider issue

Action:

1. Open the campaign details.
2. Review the recipient error message.
3. Correct the issue if possible.
4. Duplicate the campaign if you need to retry with a cleaned list.

## Preview does not look correct

1. Check your HTML formatting if using HTML mode.
2. Verify tokens are written exactly, for example `{{firstName}}`.
3. Preview the message against a selected recipient again.

---

# 16. Daily Recommended Workflow

1. Review CRM Dashboard.
2. Check new leads.
3. Update follow-up tasks.
4. Qualify and organize leads.
5. Make sure Email Manager accounts are active.
6. Create or update campaign drafts.
7. Send test emails before launching bulk campaigns.
8. Monitor campaign progress and recipient delivery results.

---

# 17. Final Notes

- Do not share email account credentials with unauthorized users.
- Use Email Campaigns responsibly and only for relevant outreach.
- Keep lead data updated so personalization and filtering work correctly.
- Use drafts and previews before sending to larger audiences.
