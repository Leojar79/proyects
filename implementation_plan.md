# Implementation Plan - AireStay Rentals

This plan outlines the steps to build a premium, modern, and responsive website for "AireStay Rentals", a short-term rental management company.

## Technology Stack
- **Framework**: React (Vite)
- **Styling**: Vanilla CSS (using CSS Variables for theming)
- **Icons**: `lucide-react` (modern, clean icons)
- **Fonts**: Google Fonts (Outfit for headings, Inter for body)

## Design System
- **Colors**:
  - Primary: Dark Blue (`#0F172A`) or Olive Green (`#3F4E4F`) - user requested choice, we'll pick Olive Green for a unique "boutique" feel.
  - Secondary: Sand/Beige (`#F5F5F0`) for warmth.
  - White: `#FFFFFF`
  - Text: Dark Gray (`#1F2937`)
  - Accent: Gold/Bronze (`#D4AF37`) for premium touches.
- **Typography**:
  - Headings: 'Outfit', sans-serif (elegant, modern).
  - Body: 'Inter', sans-serif (clean, readable).
- **Animations**: CSS transitions for hover, fade-in for sections.

## Components Structure

### Layout
- `Header`: Sticky navbar with logo and smooth scroll links.
- `Footer`: Links, contact info, social icons.

### Sections (Landing Page)
1.  **Hero**: Full-screen image, headline, subheadline, 2 CTAs, 3 quick benefits icons.
2.  **FeaturedProperties**: Grid of 6 cards. Clicking opens a Modal.
3.  **Services**: Tabbed interface (For Owners vs For Guests).
4.  **HowItWorks**: 4 vertical or horizontal steps with icons.
5.  **SocialProof**: Testimonials carousel/grid + Stat counters.
6.  **FAQ**: Accordion style questions.
7.  **ContactForm**: Lead capture form with validation.

### Features
- **Property Modal**: Detailed view (Gallery, Description, Amenities, Map placeholder, Booking button).
- **Responsive Design**: Mobile-first approach.

## Step-by-Step Implementation

1.  **Setup & Configuration**
    - Install dependencies (`npm install`, `lucide-react`).
    - configure `eslint` if needed.
2.  **Global Styles & Typography**
    - Import Google Fonts in `index.html`.
    - Define CSS variables in `index.css` (reset, colors, typography).
3.  **Base Components**
    - `Button`: Primary/Secondary variants.
    - `Section`: Wrapper with standard padding.
    - `Container`: Max-width wrapper.
4.  **Header & Footer**
    - Implement responsive navigation (hamburger menu for mobile).
5.  **Hero Section**
    - High-quality background image (placeholder from Unsplash).
    - Text overlay with animations.
6.  **Properties Section & Modal**
    - Create `PropertyCard`.
    - Create `PropertyModal`.
    - Mock data for 6 properties.
7.  **Services Section**
    - Implement Tabs component for switching views.
8.  **Remaining Sections**
    - How It Works, Testimonials, FAQ, Contact.
9.  **Polish & QC**
    - Verify responsiveness on all breakpoints.
    - Ensure accessibility (tab order, contrast).
    - Add hover effects and micro-interactions.

## File Structure
```
src/
  assets/
  components/
    common/       # Button, Card, Modal, Tabs
    layout/       # Header, Footer
    sections/     # Hero, Properties, Services, etc.
  data/           # Mock data (properties, testimonials)
  App.jsx         # Main composition
  index.css       # Global styles
  main.jsx        # Entry point
```
