-- CREATE TABLE Users (
--     user_id CHAR(36) DEFAULT (UUID()) NOT NULL,
--     name VARCHAR(100) NOT NULL,
--     email VARCHAR(255) UNIQUE NOT NULL,
--     username VARCHAR(50) UNIQUE NOT NULL,
--     password_hash VARCHAR(255) NOT NULL,
--     user_type ENUM('Student', 'Mentor', 'Admin') NOT NULL,
--     gender ENUM('Male', 'Female') NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     CONSTRAINT pk_users PRIMARY KEY (user_id)
-- );

-- CREATE TABLE Students (
--     student_id CHAR(36) NOT NULL,
--     user_id CHAR(36) NOT NULL,
--     dob DATE NOT NULL,
--     graduation_year YEAR NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     CONSTRAINT pk_students PRIMARY KEY (student_id),
--     CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
-- );

-- CREATE TABLE Mentors (
--     mentor_id CHAR(36) NOT NULL,
--     user_id CHAR(36) NOT NULL,
--     bio TEXT NOT NULL,
--     social_link VARCHAR(255),
--     image_url LONGBLOB NULL,
--     organization VARCHAR(255),
--     is_approved BOOLEAN DEFAULT FALSE,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     CONSTRAINT pk_mentors PRIMARY KEY (mentor_id),
--     CONSTRAINT fk_mentors_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
-- );

-- CREATE TABLE Mentor_Socials (
--     social_id CHAR(36) DEFAULT (UUID()) NOT NULL,
--     mentor_id CHAR(36) NOT NULL,
--     platform ENUM('GitHub', 'LinkedIn', 'Twitter', 'Facebook') NOT NULL,
--     url VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     CONSTRAINT pk_mentor_socials PRIMARY KEY (social_id),
--     CONSTRAINT fk_mentor_socials_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE
-- );




CREATE TABLE Users (
    user_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL, 
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type ENUM('Student', 'Mentor', 'Admin') NOT NULL,
    gender ENUM('Male', 'Female') NULL, 
    dob DATE NULL,
    graduation_year YEAR NULL,
    image_url LONGBLOB NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_users PRIMARY KEY (user_id)
);

CREATE TABLE Students (
    student_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    bio TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_students PRIMARY KEY (student_id),
    CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Mentors (
    mentor_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    bio TEXT NULL,
    is_approved BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_mentors PRIMARY KEY (mentor_id),
    CONSTRAINT fk_mentors_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Mentor_Socials (
    social_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    platform ENUM('GitHub', 'LinkedIn', 'Twitter', 'Facebook') NULL,
    url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_mentor_socials PRIMARY KEY (social_id),
    CONSTRAINT fk_mentor_socials_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);

CREATE TABLE Interests (
    interest_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    interest_name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_interests PRIMARY KEY (interest_id)
);

CREATE TABLE User_Interests (
    user_id CHAR(36) NOT NULL,
    interest_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_user_interests PRIMARY KEY (user_id, interest_id),
    CONSTRAINT fk_user_interests_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_interests_interest FOREIGN KEY (interest_id) REFERENCES Interests(interest_id) ON DELETE CASCADE
);

CREATE TABLE Sessions (
    session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    session_title VARCHAR(100) NOT NULL,
    type ENUM(
        'Course Topic Tuition',
        'Project Help',
        'Career Guidance',
        'Competition Prep',
        'Productivity',
        'ECA',
        'Resume Review',
        'Research Guidance',
        'Mock Interview'
    ) NOT NULL,
    description TEXT NOT NULL,
    duration_mins INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE, 
    is_offline BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_sessions PRIMARY KEY (session_id),
    CONSTRAINT fk_sessions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_duration CHECK (duration_mins > 0),
    CONSTRAINT chk_positive_price CHECK (price >= 0)
);

CREATE TABLE Mentor_Availability (
    availability_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE, 
    is_offline BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    is_booked BOOLEAN DEFAULT FALSE,
    status ENUM('Upcoming', 'Ongoing', 'Completed', 'Cancelled') DEFAULT 'Upcoming' NOT NULL,
    session_id CHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_mentor_availability PRIMARY KEY (availability_id),
    CONSTRAINT fk_mentor_availability_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT fk_mentor_availability_session FOREIGN KEY (session_id) REFERENCES Sessions(session_id) ON DELETE SET NULL
);


------------------------------------------------------------ NOT work yet
CREATE TABLE Availability_Medium_Details (
    availability_id CHAR(36) NOT NULL,
    meeting_link VARCHAR(255) NULL,
    offline_address TEXT NULL,
    CONSTRAINT pk_availability_medium_details PRIMARY KEY (availability_id),
    CONSTRAINT fk_availability_medium_details FOREIGN KEY (availability_id) REFERENCES Mentor_Availability(availability_id) ON DELETE CASCADE,
);
------------------------------------------------------------


CREATE TABLE Group_Sessions (
    group_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    session_date TIMESTAMP NOT NULL,
    duration_mins INT NOT NULL,
    max_participants INT NOT NULL,
    platform VARCHAR(255) NULL,
    status ENUM('Upcoming', 'Ongoing', 'Completed', 'Cancelled') DEFAULT 'Upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_group_sessions PRIMARY KEY (group_session_id),
    CONSTRAINT fk_group_sessions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_max_participants CHECK (max_participants > 0)
);

CREATE TABLE Group_Session_Participants (
    group_session_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('registered', 'cancelled', 'completed', 'waiting') DEFAULT 'registered' NOT NULL,
    CONSTRAINT pk_group_session_participants PRIMARY KEY (group_session_id, student_id),
    CONSTRAINT fk_group_session_participants_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_session_participants_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE
);


CREATE TABLE One_On_One_Sessions (
    one_on_one_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    availability_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    medium ENUM('online', 'offline') NOT NULL;
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_one_on_one_sessions PRIMARY KEY (one_on_one_session_id),
    CONSTRAINT fk_one_on_one_sessions_availability FOREIGN KEY (availability_id) REFERENCES Mentor_Availability(availability_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_sessions_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT uq_one_on_one_sessions UNIQUE (availability_id, student_id)
);














CREATE TABLE Mentor_Approval_History (
    history_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    admin_id CHAR(36) NOT NULL,
    action ENUM('Approved', 'Rejected') NOT NULL,
    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_approval_history PRIMARY KEY (history_id),
    CONSTRAINT fk_approval_history_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT fk_approval_history_admin FOREIGN KEY (admin_id) REFERENCES Users(user_id) ON DELETE CASCADE
);













CREATE TABLE One_On_One_Messages (
    message_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    sender_id CHAR(36) NOT NULL,
    receiver_id CHAR(36) NOT NULL,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    CONSTRAINT pk_one_on_one_messages PRIMARY KEY (message_id),
    CONSTRAINT fk_one_on_one_messages_sender FOREIGN KEY (sender_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_messages_receiver FOREIGN KEY (receiver_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE One_On_One_Reviews (
    review_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_one_on_one_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_one_on_one_reviews_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE,
    CONSTRAINT uq_one_on_one_reviews UNIQUE (one_on_one_session_id)
);

CREATE TABLE Payments (
    payment_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Pending', 'Completed', 'Failed') DEFAULT 'Pending',
    transaction_id VARCHAR(255) UNIQUE NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payments PRIMARY KEY (payment_id),
    CONSTRAINT fk_payments_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_amount CHECK (amount > 0)
);







CREATE TABLE Group_Messages (
    message_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    group_session_id CHAR(36) NOT NULL,
    sender_id CHAR(36) NOT NULL,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_group_messages PRIMARY KEY (message_id),
    CONSTRAINT fk_group_messages_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_messages_sender FOREIGN KEY (sender_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Group_Reviews (
    review_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    group_session_id CHAR(36) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_group_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_group_reviews_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE,
    CONSTRAINT uq_group_reviews UNIQUE (group_session_id)
);

CREATE TABLE Waitlist (
    waitlist_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_waitlist PRIMARY KEY (mentor_id, student_id),
    CONSTRAINT fk_waitlist_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT fk_waitlist_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE
);

CREATE TABLE Job_Postings (
    job_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_job_postings PRIMARY KEY (job_id),
    CONSTRAINT fk_job_postings_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);