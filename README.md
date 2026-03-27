# FormBuilder Pro

A SaaS-style form builder built with PHP, MySQL, and Vanilla JavaScript.

## Architecture
- **Frontend**: Clean, modern HTML/CSS and Vanilla JavaScript. Uses the Fetch API to communicate with the backend.
- **Backend**: A RESTful API built in PHP using PDO.
- **Database**: MySQL.

## Setup Instructions (for XAMPP)

1. **Move files to htdocs**
   Ensure this entire folder (`forms`) is inside your `C:\xampp\htdocs\` directory.
   The path should look like: `C:\xampp\htdocs\forms\`

2. **Database Setup**
   - Start Apache and MySQL in your XAMPP Control Panel.
   - Open phpMyAdmin (`http://localhost/phpmyadmin`).
   - Create a new database named `forms_db`.
   - Import the `database/schema.sql` file into the `forms_db` database.

3. **Run the Application**
   - Open your browser and navigate to: `http://localhost/forms/frontend/login.html`
   - Register a new account.
   - Log in and start building forms!

## Features
- **Drag & Drop Builder**: Create and reorder questions dynamically.
- **Supported Field Types**: Short text, long text, multiple choice, checkboxes, dropdown, and date picker.
- **Form Customization**: Required fields, titles, and descriptions.
- **Responses Dashboard**: View all responses in a table format and export to CSV.
- **Analytics**: Beautiful pie charts and bar charts rendered with Chart.js.
- **Security**: Password hashing (Bcrypt), Prepared Statements (PDO) to prevent SQL injection, CORS handling.
