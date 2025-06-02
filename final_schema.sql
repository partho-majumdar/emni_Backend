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
    medium ENUM('online', 'offline') NOT NULL,
    -- place VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_one_on_one_sessions PRIMARY KEY (one_on_one_session_id),
    CONSTRAINT fk_one_on_one_sessions_availability FOREIGN KEY (availability_id) REFERENCES Mentor_Availability(availability_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_sessions_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT uq_one_on_one_sessions UNIQUE (availability_id, student_id)
);

CREATE TABLE BookedSessionLinks(
  one_on_one_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
  link VARCHAR(255) NOT NULL,
  CONSTRAINT fk_one_on_one_session_id FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions (one_on_one_session_id) ON DELETE CASCADE
);

------------------------------------------------

CREATE TABLE UCOIN_Purchases (
    purchase_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    tk_amount DECIMAL(10, 2) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payment_method ENUM('Bkash', 'Nagad', 'Bank Card', 'Other', 'Rocket') NOT NULL,
    transaction_reference VARCHAR(100) UNIQUE NOT NULL,
    status ENUM('Pending', 'Completed', 'Failed') DEFAULT 'Pending' NOT NULL,
    phone_number VARCHAR(20) NULL, 
    address VARCHAR(255) NULL,
    CONSTRAINT pk_ucoin_purchases PRIMARY KEY (purchase_id),
    CONSTRAINT fk_ucoin_purchases_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_tk CHECK (tk_amount > 0),
    CONSTRAINT chk_positive_ucoin CHECK (ucoin_amount > 0)
);

-- Unchanged: Tracks UCOIN balances for users (students and mentors)
CREATE TABLE User_Balances (
    balance_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    ucoin_balance DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_user_balances PRIMARY KEY (balance_id),
    CONSTRAINT fk_user_balances_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_balance CHECK (ucoin_balance >= 0)
);

-- Unchanged: Tracks UCOIN transactions for 1:1 session bookings
CREATE TABLE Session_Transactions (
    transaction_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status ENUM('Pending', 'Completed', 'Refunded') DEFAULT 'Pending' NOT NULL,
    CONSTRAINT pk_session_transactions PRIMARY KEY (transaction_id),
    CONSTRAINT fk_session_transactions_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_transactions_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_transactions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_transaction_amount CHECK (ucoin_amount > 0)
);

CREATE TABLE Refund_Requests (
    request_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NULL,
    student_id CHAR(36) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_date TIMESTAMP NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending' NOT NULL,
    reason TEXT NULL,
    CONSTRAINT pk_refund_requests PRIMARY KEY (request_id),
    CONSTRAINT fk_refund_requests_session FOREIGN KEY (one_on_one_session_id) 
        REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE SET NULL,
    CONSTRAINT fk_refund_requests_student FOREIGN KEY (student_id) 
        REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_requests_mentor FOREIGN KEY (mentor_id) 
        REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);
---------------------------------------------------------------------







---------------------------------------------------------------------------------------------------------------

CREATE TABLE Reviews (
    review_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    reviewer_id CHAR(36) NOT NULL,
    review_text TEXT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES Students(student_id) ON DELETE CASCADE
);

-- For 1:1 session reviews
CREATE TABLE One_On_One_Reviews (
    review_id CHAR(36) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    CONSTRAINT pk_one_on_one_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_one_on_one_reviews_review FOREIGN KEY (review_id) REFERENCES Reviews(review_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_reviews_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE,
    CONSTRAINT uq_one_on_one_session_review UNIQUE (one_on_one_session_id)
);

-- For group session reviews
CREATE TABLE Group_Session_Reviews (
    review_id CHAR(36) NOT NULL,
    group_session_id CHAR(36) NOT NULL,
    CONSTRAINT pk_group_session_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_group_session_reviews_review FOREIGN KEY (review_id) REFERENCES Reviews(review_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_session_reviews_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE,
    CONSTRAINT uq_group_session_student_review UNIQUE (group_session_id, reviewer_id)
);

-- 1. User Wallet Table --
CREATE TABLE User_Wallets (
    wallet_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL UNIQUE,
    ucoin_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_wallet_id PRIMARY KEY (wallet_id),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_balance CHECK (ucoin_balance >= 0)
);

-- UCOIN Recharge 

-- UCOIN Transaction
CREATE TABLE UCOIN_Transactions (
    transaction_id CHAR(36) DEFAULT (UUID()),
    wallet_id CHAR(36) NOT NULL,
    session_id CHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    transaction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') DEFAULT 'COMPLETED',
    CONSTRAINT pk_ucoin_transactions PRIMARY KEY (transaction_id),
    CONSTRAINT fk_transaction_wallet FOREIGN KEY (wallet_id) REFERENCES User_Wallets(wallet_id),
    CONSTRAINT fk_transaction_session FOREIGN KEY (session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id),
    CONSTRAINT chk_positive_amount CHECK (amount > 0),
    CONSTRAINT chk_valid_balance CHECK (balance_after >= 0)
);

-- Blog/Project Showcase 
CREATE TABLE Posts (
    post_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    post_type ENUM('Blog', 'Project') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_posts PRIMARY KEY (post_id),
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Comments 
CREATE TABLE Comments (
    comment_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    post_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    parent_comment_id CHAR(36) NULL, 
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_comments PRIMARY KEY (comment_id),
    CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES Comments(comment_id) ON DELETE SET NULL
);