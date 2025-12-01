# Email Setup Guide for OTP Verification

## Gmail App Password Setup

To send OTP emails, you need to configure Gmail App Passwords. Follow these steps:

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", find **2-Step Verification**
4. If not enabled, click **Get started** and follow the prompts to enable 2-Step Verification
5. You'll need to verify your phone number

### Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
   - Or navigate: Google Account → Security → 2-Step Verification → App passwords
2. You might be asked to sign in again
3. Under "Select app", choose **Mail**
4. Under "Select device", choose **Other (Custom name)**
5. Type "Healthcare Portal" or any name you prefer
6. Click **Generate**
7. **IMPORTANT**: Copy the 16-character password that appears (you'll see it only once)
   - It will look like: `abcd efgh ijkl mnop` (with spaces, but remove spaces when using)

### Step 3: Update .env File

Add these lines to your `.env` file:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=abcdefghijklmnop
```

**Important Notes:**

- `EMAIL_USER` should be your full Gmail address (e.g., `yourname@gmail.com`)
- `EMAIL_PASS` should be the 16-character App Password (remove spaces if any)
- **DO NOT** use your regular Gmail password - only use the App Password

### Step 4: Test Email Configuration

After setting up, test your email configuration:

1. Start your server: `npm start` or `npm run dev`
2. Open your browser and go to: `http://localhost:5000/patientPage/test-email-config`
3. You should see a success message if configuration is correct

### Troubleshooting

#### Error: "Authentication failed" or "Invalid login"

- **Solution**: Make sure you're using the App Password (16 characters), not your regular Gmail password
- Double-check that 2-Step Verification is enabled
- Regenerate the App Password if needed

#### Error: "EMAIL_USER is not set"

- **Solution**: Make sure your `.env` file has `EMAIL_USER=your-email@gmail.com`
- Restart your server after adding environment variables

#### Error: "EMAIL_PASS is not set"

- **Solution**: Make sure your `.env` file has `EMAIL_PASS=your-16-char-app-password`
- Restart your server after adding environment variables

#### Emails not being received

- Check your **Spam/Junk** folder
- Wait a few minutes (Gmail might delay emails)
- Make sure the recipient email is correct
- Check server logs for detailed error messages

#### Still having issues?

1. Check server console logs for detailed error messages
2. Verify your `.env` file is in the project root directory
3. Make sure you restarted the server after updating `.env`
4. Test the email configuration endpoint: `/patientPage/test-email-config`

## Alternative: Using Other Email Services

If you prefer not to use Gmail, you can modify `services/emailService.js` to use:

- **Outlook/Hotmail**: Similar setup with App Password
- **SendGrid**: API-based service
- **Mailgun**: API-based service
- **SMTP Server**: Any SMTP server configuration

For SMTP configuration, update the transporter in `services/emailService.js`:

```javascript
const transporter = nodemailer.createTransporter({
  host: "smtp.example.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```
