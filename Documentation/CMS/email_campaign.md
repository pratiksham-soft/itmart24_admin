# Email Campaign Guide

This page explains Email Campaign in very easy English.

Think like this:

- `Email Manager` = the place where we add the sender email account
- `CRM Leads` = the people or companies we want to send email to
- `Email Campaign` = one big email job that sends emails one by one

---

## 1. What You Need First

Before making an email campaign, these things must be ready:

1. You need one working sender email account.
2. You need CRM leads with real email addresses.
3. You need your email subject.
4. You need your email message.

If these are not ready, the campaign cannot send properly.

---

## 2. How To Add Sender Email

Sender email means: which email account will send the campaign.

Steps:

1. Open `Marketing`.
2. Open `Email Manager`.
3. Click button to add a new email account.
4. Fill the email details.
5. Save it.
6. Make sure the email account is `Active`.

Important:

- If no active sender email is added, Email Campaign cannot send emails.

---

## 3. How To Add Or Check CRM Leads

Recipients come from CRM Leads.

Steps:

1. Open `Marketing`.
2. Open `CRM`.
3. Open `Leads`.
4. Add a new lead, or open an old lead.
5. Make sure the lead has a correct email address.
6. Save the lead.

Important:

- If a lead does not have a valid email address, that lead may not be used in the campaign.

---

## 4. How To Open Email Campaign Page

Steps:

1. Open `Marketing`.
2. Open `CRM`.
3. Open `Email Campaigns`.

On this page you can:

- create a new campaign
- edit a draft campaign
- send a draft campaign
- view campaign details
- send test email
- watch progress

---

## 5. How To Create A New Email Campaign

Steps:

1. Click `Create Campaign`.
2. Write `Campaign Name`.
3. Choose `Sender Account`.
4. Set `Delay Between Emails`.
5. Choose `Body Mode`.
6. Write the `Subject`.
7. Write the `Email Body`.

About delay:

- Delay means how many seconds the system waits before sending the next email.
- Example: if delay is `10`, system waits 10 seconds between emails.

About body mode:

- `HTML` = styled email
- `Text` = simple plain email

---

## 6. How To Choose Recipients

Recipients are the people who will get the email.

Steps:

1. In the `Recipients` section, search for leads if needed.
2. Use filters if needed.
3. Click `Filter` to load leads.
4. Tick the checkbox for the leads you want.
5. You can also click `Select All Filtered`.
6. Check the `Selected Recipients` box on the right side.

Important:

- Only leads with valid email addresses should be used.
- The selected list on the right helps you confirm who will get the email.

---

## 7. How To Use Personal Words In Email

You can add small smart words called tokens.

These tokens change for each lead.

Available tokens:

- `{{firstName}}`
- `{{lastName}}`
- `{{companyName}}`
- `{{jobTitle}}`
- `{{website}}`
- `{{email}}`

Example subject:

`Hello {{firstName}}`

Example body:

`Hello {{firstName}}, we would love to talk with {{companyName}}.`

This means each person sees their own name and company in the email.

---

## 8. How To Preview The Email

Preview means seeing how the email will look before sending.

Steps:

1. Go to the `Preview Email` section.
2. Choose one selected recipient from the preview dropdown.
3. Read the subject preview.
4. Read the email body preview.

Check that:

- the words look correct
- the tokens change correctly
- the message is clean and easy to read

---

## 9. How To Save The Campaign

Now there are two easy ways.

### Option 1: Save only

Use this when you want to keep the campaign for later.

Steps:

1. Click `Create Draft` for new campaign.
2. Or click `Save Draft` for old draft.

Result:

- campaign is saved
- status becomes `Draft`
- emails do not start yet

### Option 2: Save and start sending

Use this when you are ready to send now.

Steps:

1. Click `Create & Start Sending` for new campaign.
2. Or click `Save Draft & Start Sending` for old draft.

Result:

- campaign is saved
- sending starts
- status becomes `Sending`

---

## 10. Another Way To Start Sending

You can also start from the campaign list page.

Steps:

1. Open `Email Campaigns`.
2. Find your draft campaign.
3. Click `Send Draft`.
4. Check the sender, recipient count, delay, and subject.
5. Click `Start Sending`.

This also starts the campaign.

---

## 11. How To Send A Test Email

Test email is for checking before real sending.

Steps:

1. First save the campaign.
2. Open that campaign from the list.
3. Click `View`.
4. Go to `Send Test Email`.
5. Type your own email address.
6. Click `Send Test`.
7. Check your inbox.

Use test email to check:

- subject is correct
- body is correct
- links work
- design looks good

---

## 12. What Happens When Campaign Starts

When sending starts:

1. Campaign status becomes `Sending`.
2. System sends emails one by one.
3. System waits for the delay time between each email.
4. Progress updates on the page.

This is safer than sending all emails at the exact same second.

---

## 13. How To Check Campaign Report

To check the campaign report:

1. Open `Email Campaigns`.
2. Find the campaign.
3. Click `View`.

Here you can see:

- total recipients
- sent count
- failed count
- pending count
- progress bar
- recipient delivery table
- sent time
- error message if something failed

This page is your campaign report page.

---

## 14. What Each Status Means

### Campaign status

- `Draft` = saved, not started
- `Sending` = sending is running
- `Completed` = sending finished
- `Failed` = sending had a big problem
- `Cancelled` = sending was stopped

### Recipient status

- `pending` = waiting
- `sending` = sending now
- `sent` = email sent
- `failed` = email could not be sent
- `skipped` = system skipped this one

---

## 15. How To Stop A Campaign

If a campaign is already sending:

1. Open `Email Campaigns`.
2. Find the campaign with status `Sending`.
3. Click `Cancel`.

Then the system will stop the sending safely.

---

## 16. How To Use Old Campaign Again

If you want to send a similar campaign again:

1. Open `Email Campaigns`.
2. Find the old campaign.
3. Click `Duplicate`.
4. A new draft copy will open.
5. Change anything you want.
6. Save or send it.

This is better than trying to reuse a completed campaign directly.

---

## 17. Easy Full Workflow

Use this simple order every time:

1. Add sender email in `Email Manager`.
2. Make sure sender email is active.
3. Add or check CRM leads.
4. Make sure leads have valid email addresses.
5. Open `CRM > Email Campaigns`.
6. Click `Create Campaign`.
7. Fill campaign name, sender, delay, subject, and body.
8. Select recipients.
9. Preview the email.
10. Save draft or start sending.
11. Send a test email if needed.
12. Start the real campaign.
13. Open `View` to check progress and report.

---

## 18. If Something Is Not Working

### Problem: sender account not showing

Do this:

1. Go to `Email Manager`.
2. Add sender email.
3. Make sure it is active.

### Problem: no recipients can be selected

Do this:

1. Open CRM leads.
2. Check that leads have valid email addresses.
3. Come back and load recipients again.

### Problem: campaign saved but not sending

Do this:

1. Check if status is still `Draft`.
2. Click `Send Draft`.
3. Or use `Create & Start Sending` / `Save Draft & Start Sending`.

### Problem: some emails failed

Do this:

1. Open `View`.
2. Read the error message in recipient table.
3. Fix the issue.
4. Duplicate the campaign and try again if needed.

---

## 19. Best Simple Rules

- Use real sender email.
- Use real recipient email.
- Read the preview before sending.
- Send test email first when possible.
- Do not send wrong or spammy message.
- Check the report after sending.

---

## 20. Short Reminder

Very short version:

1. Add sender email.
2. Add leads with valid emails.
3. Create campaign.
4. Select recipients.
5. Preview.
6. Save or send.
7. Check report.
