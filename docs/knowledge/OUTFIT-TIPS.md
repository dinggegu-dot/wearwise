# WearWise Outfit Recommendation Knowledge Base

**Document Name:** OUTFIT-RECOMMENDATION-KNOWLEDGE.md  
**Version:** V1.2  
**Owner:** M05 — Weather and Recommendation Module  
**Document Status:** Final Version  
**Scope:** Temperature and weather assessment, occasion classification, overall outfit styles, color coordination, outfit composition, and recommendation rules.

---

# 1. Introduction

## 1.1 Purpose

This document defines the basic knowledge and decision-making rules required by WearWise's AI outfit recommendation system. It provides a foundation for generating reasonable, complete, and user-oriented outfit recommendations.

The knowledge framework covers four core dimensions:

1. **Temperature and Weather:** Determine appropriate clothing based on apparent temperature, daily temperature variation, and rainfall conditions, and provide relevant weather reminders.
    
2. **Occasion:** Identify the user's current activity and clothing requirements to determine which outfits are appropriate.
    
3. **Overall Outfit Style:** Determine the desired visual direction of the complete outfit based on the user's style preferences.
    
4. **Color Coordination:** Evaluate the color harmony of the complete outfit to help the AI select and rank outfit combinations.
    

All recommendations must be based on garments actually available in the user's wardrobe. The system must not invent garments that the user does not own.

Garment category, color, fit, thickness, and material are independent attributes. Style tags and occasion tags describe a garment's stylistic characteristics and potential usage scenarios.

## 1.2 Basic Principles

Outfit recommendations should follow these principles:

- Temperature determines the basic clothing requirements.
    
- Weather conditions are used to determine whether additional reminders are necessary.
    
- Occasion determines the environmental and activity-related requirements of an outfit.
    
- Overall outfit style determines the desired visual appearance.
    
- Color coordination evaluates the harmony of the complete outfit.
    
- Style and occasion are two independent dimensions and must not be confused.
    
- A garment may have multiple style tags and multiple occasion tags.
    
- Recommended garments must come from the user's actual and currently available wardrobe.
    
- Basic outfit completeness requirements must be satisfied. Missing garments must not be fabricated to complete an outfit.
    
- Weather reminders should be displayed separately from the main outfit recommendation.
    
- Matching style and occasion tags is a recommendation consideration, not an automatic exclusion rule.
    
- Garment thickness must participate in temperature suitability assessment, while fit and material serve as auxiliary factors.
    

## 1.3 Rule Types

Rules in this knowledge base can be understood as follows:

|Rule Type|Description|
|---|---|
|Basic Rules|Fundamental principles that the recommendation system should follow|
|Recommendation Guidelines|Reference principles used by the AI to select and rank outfit combinations|
|Flexible Judgments|Decisions that should take the user's specific requirements, garment attributes, and actual occasion into account|

---

# 2. Temperature and Weather Assessment

## 2.1 Temperature Classification

WearWise prioritizes **Feels-like Temperature** rather than actual air temperature.

Temperature is divided into six levels:

|Level|Feels-like Temperature|Category|Basic Clothing Direction|
|---|---|---|---|
|T1|Below 10°C|Cold|Warm inner layers with an insulating outer layer|
|T2|10°C to below 16°C|Cool|Long sleeves, knitwear, and suitable outerwear|
|T3|16°C to below 22°C|Mild|Long sleeves or lightweight tops; outerwear depending on conditions|
|T4|22°C to below 26°C|Warm|Short sleeves or lightweight tops|
|T5|26°C to below 31°C|Hot|Lightweight and breathable clothing|
|T6|31°C or above|Extremely Hot|Minimize layers and avoid heavy clothing|

These temperature ranges serve as the basic reference for WearWise recommendations. Actual comfort may also depend on personal cold tolerance, regional climate, and garment insulation.

Temperature classification must cover all numerical values without overlapping or missing intervals.

## 2.2 Temperature Data Priority

The recommendation system should use temperature data in the following order:

1. Prioritize the current feels-like temperature.
    
2. When the daily temperature variation is significant, use the average daily feels-like temperature to determine the main clothing direction.
    
3. If feels-like temperature is unavailable, use actual air temperature as a fallback.
    

The following data must be distinguished:

|Data|Meaning|Main Purpose|
|---|---|---|
|Current Feels-like Temperature|The perceived temperature at the current time|Primary basis for normal temperature classification|
|Average Daily Feels-like Temperature|The predicted average feels-like temperature for the day|Determines the main clothing direction when daily temperature variation is significant|
|Maximum Daily Feels-like Temperature|The predicted maximum feels-like temperature|Identifies warmer periods during the day|
|Minimum Daily Feels-like Temperature|The predicted minimum feels-like temperature|Identifies colder periods during the day|
|Actual Air Temperature|Air temperature without apparent-temperature adjustment|Fallback when feels-like temperature is unavailable|

Actual air temperature and feels-like temperature must not be treated as interchangeable.

## 2.3 Large Daily Temperature Variations

When the difference between the day's maximum and minimum feels-like temperatures is significant, the system must not determine the entire day's clothing requirements based only on the current feels-like temperature.

Temperature difference is calculated as:

**Daily Temperature Difference = Maximum Daily Feels-like Temperature − Minimum Daily Feels-like Temperature**

A difference of 8°C or more can be treated as a large daily temperature variation.

When this condition is met:

- Use the average daily feels-like temperature to determine the main temperature category.
    
- Generate the main outfit based on that average temperature.
    
- Additionally remind the user to carry an outer layer to handle temperature changes in the morning and evening.
    
- The extra outer layer does not have to be included in the main outfit recommendation.
    

Example:

|Weather Data|Temperature|
|---|---|
|Minimum Daily Feels-like Temperature|10°C|
|Average Daily Feels-like Temperature|17°C|
|Maximum Daily Feels-like Temperature|24°C|
|Daily Temperature Difference|14°C|

Recommendation:

- The daily temperature difference meets the large-variation criterion.
    
- Use 17°C as the average daily feels-like temperature.
    
- Classify the day as T3 (Mild).
    
- Generate the main outfit according to T3 clothing guidelines.
    
- Additionally remind the user to carry an outer layer.
    

Example reminder:

"The temperature difference between morning and evening will be significant today. Consider carrying an extra jacket."

## 2.4 Rainfall Conditions

Rainfall is a weather reminder condition rather than an independent outfit filtering condition.

Rainfall alone should not directly change:

- Top selection.
    
- Bottom selection.
    
- Shoe selection.
    
- Main color coordination.
    
- Occasion classification.
    
- The user's selected outfit style.
    

The system should mainly provide the following reminders:

**Situation 1: Rain is expected during the day**

Remind the user to bring an umbrella.

Example:

"Rain is expected today. Remember to bring an umbrella."

**Situation 2: Rain is expected and the temperature is low**

Remind the user to bring an umbrella and consider whether additional clothing thickness is needed.

Example:

"Rain and low temperatures are expected today. Remember to stay warm and consider wearing an additional layer."

Important considerations:

- Rainfall should not automatically exclude a garment.
    
- The system must not assume a garment is waterproof without waterproofing information.
    
- Rainfall should not automatically trigger replacement of the main outfit.
    
- Weather reminders should be displayed separately from the main outfit recommendation.
    
- If a large temperature difference has already triggered an outerwear reminder, avoid repeating the same reminder.
    

## 2.5 Handling Missing Weather Data

When weather data is incomplete:

- Prioritize valid feels-like temperature data that has already been obtained.
    
- Do not fabricate missing maximum, minimum, or average feels-like temperatures.
    
- If maximum and minimum feels-like temperatures are unavailable, do not conclude that a large daily temperature variation exists.
    
- If rainfall forecasts are unavailable, do not claim that it will or will not rain.
    
- If the available weather data is sufficient for a basic recommendation, the system may continue.
    
- If the available data is insufficient for reliable assessment, the system should explain which information is missing.
    

---

# 3. Occasion Classification

## 3.1 Definition and Purpose of Occasion

**Occasion** describes the user's current activity, environment, and practical clothing requirements.

Occasion and overall outfit style are two independent dimensions:

- **Occasion:** Where the user is going, what activity they will participate in, and what environmental requirements the outfit must satisfy.
    
- **Style:** What visual appearance the user wants to achieve.
    

For example, the same work occasion may involve a minimalist, elegant, or another suitable style. The occasion remains the same, but the overall outfit direction can differ.

Occasion determines the basic requirements of the outfit, while style determines its visual direction within those requirements.

## 3.2 Occasion Tag System

WearWise uses an independent fixed occasion-tag vocabulary.

The number of occasion tags should exceed three and cover different daily activities and usage scenarios. At a minimum, the following directions must be covered:

|Occasion Direction|Example Scenarios|
|---|---|
|Study|Attending classes, self-study, studying in a library|
|Work|Office commuting, daily work|
|Date|Dates, going out with someone|
|Friends Gathering|Dining with friends, meeting friends|
|Fitness and Sports|Gym workouts, running, sports training|
|Outdoor|Outdoor activities, excursions, outdoor trips|

These are the minimum coverage directions and do not represent the complete occasion vocabulary.

The wardrobe and outfit recommendation pages must use the same occasion tags and corresponding definitions to avoid inconsistent naming across pages.

## 3.3 Rules for Garment Occasion Tags

Garment occasion tags describe the scenarios in which a garment may be suitable.

The following principles apply:

- A garment may have multiple occasion tags.
    
- Basic garments are not required to belong to only one occasion.
    
- Occasion tags are used to assist recommendations and do not define strict usage boundaries.
    
- The absence of a matching occasion tag does not necessarily mean that a garment is unsuitable for the selected occasion.
    
- The AI should assess suitability based on garment category, color, fit, thickness, material, and overall outfit knowledge.
    

For example, a simple white shirt may be suitable for studying, working, and dating.

A garment must not be excluded solely because it does not have the same occasion tag as the user's selected occasion.

## 3.4 Occasion Assessment Principles

The AI should determine the occasion based on the user's actual activity and clothing requirements rather than mechanically classifying activities by name alone.

Specific principles:

- Prioritize the activities and dress requirements explicitly stated by the user.
    
- When the user's description is unclear, make a reasonable judgment based on the actual activity.
    
- Do not classify ordinary activities as highly formal business occasions without sufficient reason.
    
- The same activity may involve different clothing requirements, so additional information from the user should be considered.
    
- Occasion tags are one of the recommendation criteria, not absolute garment filtering conditions.
    

Examples:

- Ordinary campus activities generally belong to the study occasion.
    
- Office commuting generally belongs to the work occasion.
    
- A restaurant date belongs to the date occasion.
    
- An ordinary dinner with friends belongs to the friends gathering occasion.
    
- Gym training belongs to the fitness and sports occasion.
    

The final outfit should still be evaluated based on the user's selected style and actual environment.

## 3.5 Custom Occasion Descriptions

The outfit recommendation page allows users to enter specific activities or additional requirements beyond the fixed occasion tags.

Examples:

- Attending a friend's birthday party.
    
- Attending a company annual event.
    
- Going hiking outdoors on the weekend.
    
- Attending a formal event.
    

Custom occasion descriptions are temporary conditions for the current recommendation. They do not automatically create public occasion tags or enable users to create custom tags in the shared tag library.

The AI should interpret the specific clothing requirements based on the user's description.

---

# 4. Overall Outfit Style

## 4.1 Definition and Purpose of Style

**Overall Outfit Style** describes the visual characteristics and overall appearance that the user wants to achieve through clothing.

The following concepts must be distinguished:

- **Overall Outfit Style:** The main visual direction the user wants the complete outfit to express.
    
- **Individual Garment Style Tags:** The stylistic attributes of each garment in the wardrobe.
    

Occasion and style are independent.

For example, the same work occasion may involve a minimalist or elegant style. The occasion remains the same, but the overall visual direction differs.

## 4.2 Style Tag System

WearWise uses a unified fixed style-tag vocabulary.

The number of style tags should exceed six to cover different fashion preferences and visual directions.

The style-tag system should distinguish different styles clearly and avoid forcing garments with diverse characteristics into a small number of categories.

Style directions may include, but are not limited to:

- Neutral Style.
    
- Sweet Style.
    
- Subculture Style.
    
- Minimalist Style.
    
- Elegant Style.
    
- Vintage Style.
    
- Streetwear.
    
- Athleisure.
    
- Preppy Style.
    

These are examples of style directions and do not represent the complete fixed tag list.

The wardrobe and outfit recommendation pages must use the same fixed style tags and corresponding definitions. Style options, AI recognition mapping, and saving validation must remain consistent.

## 4.3 Rules for Individual Garment Style Tags

An individual garment may have multiple style tags.

For example:

- A white knit sweater may have both minimalist and preppy characteristics.
    
- An oversized graphic T-shirt may have both streetwear and subculture characteristics.
    
- A simply designed shirt may have both minimalist and elegant characteristics.
    

The following principles apply:

- AI should prioritize mapping recognition results to the fixed style vocabulary.
    
- Expressions with the same or similar meanings should be mapped consistently.
    
- A garment may have multiple style tags.
    
- A garment is not required to belong to only one style.
    
- Garment style must not be determined solely by color or clothing category.
    
- The AI should consider silhouette, patterns, design features, and overall visual characteristics.
    

If a recognized style cannot be mapped to a fixed tag, the system may use "Other" and retain the original recognized term or description for user confirmation.

"Other" is not equivalent to "Uncertain" and does not automatically expand the public style vocabulary.

## 4.4 Understanding Common Outfit Styles

The following descriptions help the AI understand common styles. They do not represent the complete fixed style-tag vocabulary.

### Minimalist Style

**Definition:**

Minimalist style emphasizes simplicity, cleanliness, and overall coordination. It avoids excessive decoration and visual complexity.

Main characteristics:

- Relatively simple color combinations.
    
- Frequent use of basic colors such as black, white, gray, beige, and navy.
    
- Emphasis on overall coordination.
    
- Limited use of complicated patterns.
    
- A clean and neat overall appearance.
    

Common color directions:

- Black, white, and gray.
    
- Beige and brown.
    
- Navy and white.
    
- Low-saturation neutral combinations.
    

### Elegant Style

**Definition:**

Elegant style emphasizes refinement, softness, and appropriateness. It focuses on coordination between garments and the overall appearance.

Main characteristics:

- Refined overall styling.
    
- Coordinated colors with natural transitions.
    
- Frequent use of soft or subdued colors.
    
- Emphasis on visual balance.
    
- Avoids relying on strong color contrast to create visual focus.
    

Common color directions:

- Beige, white, and cream.
    
- Light gray and gray-blue.
    
- Brown and soft warm tones.
    
- Low-saturation color combinations.
    

Elegant style is not equivalent to formal business style. It does not mean that only light or soft colors can be used.

### Vintage Style

**Definition:**

Vintage style emphasizes classic, nostalgic, and period-inspired visual expression.

Main characteristics:

- Use of colors with a vintage appearance.
    
- May include plaid and other classic patterns.
    
- Emphasis on consistency in the overall vintage aesthetic.
    
- A classic overall appearance.
    

Common color directions:

- Brown and coffee.
    
- Burgundy.
    
- Dark green.
    
- Beige and vintage yellow.
    
- Other colors with a vintage visual effect.
    

Vintage style should not be identified solely based on one brown or burgundy garment. The overall outfit must be considered.

### Streetwear

**Definition:**

Streetwear emphasizes individuality, freedom, and expressive visual styling. It is generally more casual and does not deliberately pursue a traditional formal appearance.

Main characteristics:

- Allows more noticeable color contrasts.
    
- May include patterns or visually distinctive garments.
    
- Emphasizes individual expression.
    
- May incorporate sportswear or street-culture elements.
    
- Has a relatively relaxed and flexible visual direction.
    

Common color directions:

- Black and white.
    
- Dark gray and navy.
    
- Bright color accents.
    
- High-contrast color combinations.
    

Streetwear is not simply defined by oversized clothing or sneakers. The consistency of the complete outfit must also be considered.

### Athleisure

**Definition:**

Athleisure combines sportswear elements with everyday clothing, emphasizing energy, comfort, and a sporty appearance.

Main characteristics:

- Noticeable sportswear elements.
    
- A relaxed and active visual appearance.
    
- Can combine athletic garments with everyday clothing.
    
- Emphasizes natural coordination.
    

Common color directions:

- Black, white, and gray.
    
- Navy.
    
- Appropriate bright sportswear colors.
    
- Simple two-color or multi-color combinations.
    

Athleisure is not equivalent to formal sports training clothing. It mainly refers to incorporating sportswear aesthetics into everyday outfits.

### Preppy Style

**Definition:**

Preppy style emphasizes a clean, structured, youthful appearance with a classic academic or campus-inspired aesthetic.

Main characteristics:

- A neat and structured overall outfit.
    
- May include shirts, knitwear, plaid, and other classic elements.
    
- Relatively coordinated colors.
    
- A classic and fresh overall appearance.
    

Common color directions:

- Navy and white.
    
- Gray and beige.
    
- Brown and burgundy.
    
- Plaid and classic color combinations.
    

Preppy style should not be identified solely because an outfit contains plaid or a shirt. The overall outfit must reflect the relevant visual characteristics.

## 4.5 Style Input Rules on the Recommendation Page

The "Current Preference" section on the outfit recommendation page combines fixed style tags and natural-language descriptions. Together, they form the user's current-round preference input.

Users can set their current preferences in two ways:

**Method A: Upload a Reference Image**

The user uploads an outfit image they want to use as inspiration. The AI analyzes the image and returns:

- A natural-language description.
    
- Corresponding style tags.
    

The recognition results are automatically populated into the text and tag areas of the interface.

Users can:

- Modify the AI-generated description.
    
- Modify existing style tags.
    
- Delete unwanted tags.
    
- Add other style tags.
    
- Supplement the input with specific elements they like or dislike.
    

Image recognition results are only an initial draft. The system must not assume that the user likes every element in the image. The final input must follow the user's modifications.

**Method B: Do Not Upload a Reference Image**

Users can directly select, add, or delete tags from the fixed style vocabulary and supplement them with natural-language descriptions.

Manual tag selection does not require AI image recognition.

Both methods use the same tag area and text area and ultimately form one unified current-preference input.

## 4.6 Combining Style and Occasion

Occasion and style are independent but should remain reasonably compatible.

The following principles apply:

- Occasion determines the basic requirements of the outfit.
    
- The user's selected style determines the visual direction.
    
- If style conflicts with occasion, explicit dress requirements take priority.
    
- The system should preserve the user's selected style as much as possible while satisfying the occasion requirements.
    
- The system must not replace the user's selected style with another style without explanation.
    
- A garment must not be excluded solely because it lacks the corresponding style tag.
    

For example, if the user wants a streetwear outfit for a formal work environment, the AI should first consider the actual dress requirements of that environment and then try to retain appropriate streetwear elements. If the wardrobe does not contain a combination that satisfies both requirements, the system should explain the limitation.

## 4.7 Relationship Between Overall Outfit Style and Individual Garment Tags

A recommended outfit may contain garments with different secondary style characteristics, but the overall visual appearance should remain consistent with the user's main preference.

The following principles apply:

- All garments are not required to have identical style tags.
    
- Garments with different style tags may be combined.
    
- The visual coordination between garments should be considered.
    
- The style of the complete outfit must not be determined solely by the tag of one garment.
    
- If the wardrobe does not contain enough garments to support the user's style requirements, the system should explain this rather than inventing garments.
    

---

# 5. Color Coordination Rules

## 5.1 Color Classification

Colors are first divided into three broad categories:

|Color Category|Main Colors|
|---|---|
|Neutral Colors|Black, white, gray, beige, khaki, brown, navy|
|Warm Colors|Red, orange, yellow, warm pink, etc.|
|Cool Colors|Blue, green, purple, cool pink, etc.|

Some colors may have different warm and cool undertones.

If the garment color information does not provide sufficient evidence, the AI should not overestimate its exact undertone.

## 5.2 Color Standardization

Colors with similar meanings may be normalized to simplify the AI's assessment of color relationships.

Examples:

|Original Color Description|Normalized Category|
|---|---|
|Off-white, cream white|White / Neutral|
|Navy blue, dark blue|Blue / Neutral|
|Burgundy, dark red|Red|
|Light khaki, camel|Brown / Neutral|
|Light gray, dark gray|Gray / Neutral|

Color normalization must not overwrite the original color description.

When there are obvious differences in color depth, the original lightness or darkness information should be retained.

## 5.3 Four Basic Color Coordination Methods

### 5.3.1 Monochromatic Coordination

Combines different shades within the same color family.

Examples:

- Light beige top + khaki bottoms.
    
- Light blue top + dark blue bottoms.
    

Characteristics:

- Overall coordination.
    
- Consistent visual direction.
    
- Relatively low risk of obvious color conflict.
    

### 5.3.2 Neutral Color Coordination

Combines basic colors such as black, white, gray, beige, and brown.

Examples:

- White top + black bottoms.
    
- Beige top + brown bottoms.
    
- Gray top + black bottoms.
    

Characteristics:

- Relatively safe color combinations.
    
- Easily creates a simple and coordinated appearance.
    
- Suitable for various occasions and styles.
    

### 5.3.3 Analogous Color Coordination

Combines colors that are close to each other on the color wheel.

Examples:

- Blue + green.
    
- Yellow + orange.
    

Characteristics:

- Natural color transitions.
    
- Can create a visually unified appearance.
    

### 5.3.4 Complementary Color Coordination

Combines colors with strong contrast.

Examples:

- Blue + orange.
    
- Red + green.
    

Characteristics:

- Creates a noticeable visual focus.
    
- Suitable when stronger color contrast is desired.
    
- Color proportions should be considered to avoid using too many highly saturated colors simultaneously.
    

## 5.4 Overall Color Harmony Assessment

The AI should assess the complete outfit rather than judging only whether the top and bottoms match.

Important considerations:

1. Whether the outfit has a clear main color.
    
2. Whether the other colors coordinate with the main color.
    
3. Whether neutral colors are used appropriately for balance.
    
4. Whether there are too many highly saturated colors.
    
5. Whether the overall colors suit the selected occasion.
    
6. Whether the overall colors match the user's style preferences.
    

## 5.5 Main Colors and Color Quantity

An outfit may use 2–3 main colors as a general reference.

- Neutral colors can be used to balance the overall appearance.
    
- A small number of accent colors can create visual focus.
    
- Avoid allowing multiple strong colors to become the main visual focus simultaneously.
    

The 2–3 main-color guideline is a reference rather than a mandatory restriction.

Garments with prints, patterns, or multiple colors should be assessed flexibly.

## 5.6 Brightness and Saturation

Color assessment should consider more than color names. The following aspects should also be considered:

- **Brightness:** Whether a color is relatively light or dark.
    
- **Saturation:** Whether a color is vivid or muted.
    
- Whether the light and dark elements of the outfit are balanced.
    
- Whether there are too many highly saturated colors.
    
- Whether neutral colors are needed to create balance.
    

The current assessment is primarily qualitative. The AI is not required to calculate exact color values.

When only textual color descriptions are available, the AI must not invent precise hue, brightness, or saturation values.

## 5.7 Relationship Between Color and Occasion

|Occasion Direction|Color Coordination Direction|
|---|---|
|Study and Daily Activities|Relatively flexible color choices; noticeable color contrast may be used|
|Work|Prioritize coordinated, neat, and relatively subdued color combinations|
|Date|Choose soft, coordinated, or visually distinctive colors based on user preferences|
|Friends Gathering|Relatively flexible color choices based on the atmosphere of the activity|
|Fitness and Sports|Fresh, energetic, or appropriately contrasting combinations|
|Outdoor|Choose colors based on the activity environment and user preferences|

An occasion does not restrict the outfit to a fixed set of colors.

## 5.8 Relationship Between Color and Overall Style

Color coordination should also complement the user's style preferences.

|Style Direction|Color Coordination Direction|
|---|---|
|Minimalist Style|Basic colors, neutrals, and relatively simple color combinations|
|Elegant Style|Soft, coordinated colors with natural transitions|
|Vintage Style|Brown, burgundy, dark green, and other vintage-inspired colors|
|Streetwear|More noticeable contrasting colors, accent colors, and expressive combinations|
|Athleisure|Sporty, fresh, or appropriately contrasting colors|
|Preppy Style|Classic coordinated colors such as navy, white, gray, brown, and burgundy|

These are general styling directions rather than mandatory color restrictions.

A garment's style must not be determined solely by its color. The visual effect of the complete outfit should be considered.

## 5.9 Special Color Situations

If a garment has any of the following characteristics:

- Multiple main colors.
    
- Complex prints.
    
- Gradient colors.
    
- Missing or unclear color information.
    

The AI should prioritize reliable information about the garment's main colors.

If the main colors cannot be determined accurately, the AI should reduce the confidence of its color assessment rather than arbitrarily assigning colors.

## 5.10 Nature of Color Rules

Color coordination is a soft rule.

Color harmony is mainly used to evaluate and rank valid outfit combinations.

A combination should not be rejected solely because its color coordination is less than ideal if it already satisfies the requirements for weather, occasion, and outfit completeness.

---

# 6. Outfit Composition Principles

## 6.1 Basic Outfit Structures

WearWise supports two basic outfit structures:

|Outfit Type|Required Garment Categories|
|---|---|
|Regular Outfit|Top + Bottom + Shoes|
|Dress Outfit|Dress + Shoes|

Depending on the temperature, outerwear may be included as part of a complete outfit.

## 6.2 Relationship Between Garment Thickness and Temperature

Garment thickness is an important attribute for determining whether clothing is suitable for the current temperature. It must participate in temperature suitability assessment.

Basic principles:

- **T1 and T2:** Prioritize garments with sufficient insulation. Suitable outerwear is generally required.
    
- **T3:** Determine whether outerwear is necessary based on the actual temperature and garment thickness.
    
- **T4, T5, and T6:** Prioritize lightweight and breathable garments. Heavy outerwear should not be added automatically.
    
- At the same temperature level, assess the combined thickness of the top, bottoms, and outerwear.
    
- Do not determine the temperature suitability of the entire outfit based solely on the thickness of one garment.
    

If no suitable outerwear is available under low-temperature conditions, an outfit without adequate outerwear must not be presented as a complete low-temperature recommendation.

If garment thickness information is unknown, the system must not automatically assume that the garment provides sufficient warmth.

## 6.3 Fit and Material as Auxiliary Factors

Fit and material serve as auxiliary factors in temperature and outfit suitability assessment.

Examples:

- A loose fit may provide more room for inner layers and layering.
    
- A tight fit may affect layering comfort.
    
- Different materials may influence warmth, breathability, and wearing comfort.
    
- Certain materials may be more suitable for particular seasons or weather conditions.
    

Important considerations:

- Fit and material cannot replace the thickness attribute.
    
- The AI must not infer definite insulation or waterproof properties solely from fit or material.
    
- If relevant attributes are missing, the certainty of the assessment should be reduced.
    
- Fit and material are mainly used for auxiliary filtering and recommendation ranking. They should not become hard exclusion criteria without sufficient evidence.
    

## 6.4 Additional Outerwear for Large Temperature Variations

When there is a large daily temperature variation, the system may recommend carrying an additional outer layer.

The following concepts must be distinguished:

- **Main Outfit Garments:** Garments actually included in the recommended outfit.
    
- **Additional Carrying Suggestions:** Auxiliary suggestions based on daily temperature variation.
    

For example:

Main outfit:

- Top.
    
- Bottoms.
    
- Shoes.
    

Additional suggestion:

"The temperature difference between morning and evening will be significant. Consider carrying an extra jacket."

The additional jacket does not necessarily need to be included in the main outfit.

## 6.5 Real Wardrobe Constraints

All recommended garments must come from the user's actual wardrobe and must currently be available for recommendation.

The AI must not:

- Invent garments or garment IDs.
    
- Recommend garments that have been deleted or temporarily paused.
    
- Assume that the user owns a garment based on common outfit knowledge.
    
- Create missing garments to complete an outfit.
    

If the wardrobe lacks a necessary garment category, the system must clearly explain what is missing.

Deleted and paused garments must be respected. They cannot be selected for new outfits or individual garment replacements.

## 6.6 Use of Style and Occasion Tags

The recommendation system should assess garment suitability based on style tags, occasion tags, and other garment attributes.

- Style tags help determine how well a garment matches the user's current style preferences.
    
- Occasion tags help assess whether a garment may be suitable for the current activity.
    
- Thickness helps determine whether a garment satisfies temperature requirements.
    
- Color is used to evaluate the harmony of the complete outfit.
    
- Fit and material serve as auxiliary assessment factors.
    

A garment must not be excluded solely because it lacks a particular style or occasion tag.

If a garment lacks tags, the system should use its existing attributes and other outfit knowledge for assessment rather than inventing tags.

---

# 7. Recommendation Inputs and Rule Priorities

## 7.1 Four Conditions on the Recommendation Page

The outfit recommendation page contains four independent conditions:

|Condition|Information Used|Initial Default State|
|---|---|---|
|Consider Past Memories and Preferences|Explicit preferences, inspiration summaries, and permanent feedback|Enabled|
|Consider Weather|Weather conditions for the selected city on the current day|Enabled|
|Current Preference|Reference image analysis, style tags, and natural-language descriptions|Disabled and Empty|
|Current Occasion|Fixed occasion tags and user-provided descriptions|Disabled and Empty|

Current Preference and Current Occasion have separate switches.

**Current Preference has only one main switch. Uploading a reference image and manually selecting tags are two input methods, not two independent conditions.**

If a condition is enabled but empty, it does not participate in recommendation generation and does not prevent generation.

When a condition is disabled, its existing content is retained, but it is treated as empty during generation.

## 7.2 Current Preference Input Rules

Current Preference consists of:

- User-selected fixed style tags.
    
- Additional natural-language descriptions.
    
- An optional outfit reference image and its AI analysis results.
    

Style tags and natural-language descriptions generated from a reference image are automatically populated into the interface. Users can modify, delete, or supplement them.

If the user does not upload an image, they can directly select fixed style tags and provide additional text.

Both methods use the same tag area and text area and form one unified current-preference input.

Current Preference is a temporary recommendation condition. It is not automatically saved to the wardrobe, Outfit Inspiration, or long-term preferences.

## 7.3 Current Occasion Input Rules

Current Occasion uses the same fixed occasion tags as the wardrobe.

Users can:

- Select one or more occasion tags suitable for the current activity.
    
- Add descriptions of specific activities.
    
- Provide additional requirements for the current occasion.
    

Custom descriptions only participate in the current recommendation and do not automatically create public occasion tags.

Current Occasion and Current Preference are independent.

For example:

- Current Preference: Minimalist Style, Neutral Style.
    
- Current Occasion: Work.
    

The AI should consider both the user's desired visual style and the actual requirements of the work environment rather than combining them into a single tag.

## 7.4 Recommendation Rule Categories

The recommendation process uses three types of rules.

### Hard Rules

Hard rules are basic conditions that a recommendation must satisfy.

Examples:

- Only use garments that actually exist and are currently available.
    
- Satisfy the basic garment-category requirements for a complete outfit.
    
- Consider applicable temperature requirements.
    
- Follow explicit clothing requirements stated by the user.
    
- Do not violate explicit dress-code restrictions.
    

A combination that violates a hard rule must not be output as a valid complete outfit recommendation.

### Soft Rules

Soft rules are used to evaluate and rank combinations that already satisfy the basic requirements.

Examples:

- Color coordination.
    
- Balance between main and secondary colors.
    
- Overall style consistency.
    
- Matching the user's style preferences.
    
- Suitability for the selected occasion.
    
- Auxiliary suitability based on fit and material.
    

Soft rules mainly affect recommendation ranking and should not easily result in direct exclusion.

### Reminder Rules

Reminder rules provide additional information to the user without directly changing the main outfit combination.

Examples:

- Remind the user to bring an umbrella when rain is expected.
    
- Remind the user to carry an outer layer when there is a large daily temperature variation.
    
- Suggest considering additional clothing thickness when it is cold and rainy.
    

All weather reminders should be displayed separately from the main outfit recommendation.

## 7.5 Recommendation Priority

The overall recommendation sequence is:

1. Check whether garments actually exist and are currently available.
    
2. Check whether the basic garment-category requirements for a complete outfit are satisfied.
    
3. Assess temperature suitability based on temperature and garment thickness.
    
4. Assess suitability based on explicit occasion requirements and the current occasion.
    
5. Determine the visual direction based on the user's style preferences and garment style tags.
    
6. Evaluate and rank the outfit based on color coordination, fit, material, and other factors.
    
7. Generate recommendation explanations.
    
8. Provide separate weather reminders.
    

If the wardrobe does not contain a combination that satisfies the basic requirements, the system must explain the reason rather than generating an invalid outfit by relaxing those requirements.

---

# 8. Recommendation Explanations

Every recommended outfit should include clear and easy-to-understand explanations.

## 8.1 Temperature Suitability

Explain why the selected garments are suitable for the current temperature.

Example:

"The long-sleeved top paired with a lightweight jacket is suitable for today's mild weather."

If the jacket's thickness information is insufficient, the system must not claim that it provides a definite level of warmth.

## 8.2 Occasion Suitability

Explain why the complete outfit is suitable for the user's selected occasion.

Example:

"The overall outfit is neat and appropriate for everyday office commuting."

## 8.3 Style Suitability

Explain why the complete outfit matches the user's selected style preference.

Example:

"This outfit uses a simple combination of basic colors, creating a clean and coordinated appearance that matches the minimalist style."

## 8.4 Color Coordination

Explain the color relationships within the complete outfit.

Example:

"White and beige create a soft neutral combination, resulting in a coordinated overall appearance."

## 8.5 Additional Attribute Explanations

If fit or material has actually influenced the recommendation, the system may explain this.

Example:

"The loose fit provides room for layering and is suitable for the current clothing requirements."

The system must not invent explanations when the relevant garment attributes are unavailable.

## 8.6 Weather Reminders

Weather reminders should be displayed separately rather than mixed with the main outfit explanation.

Examples:

- "Rain is expected today. Remember to bring an umbrella."
    
- "There will be a large temperature difference between morning and evening. Consider carrying an extra jacket."
    
- "Rain and low temperatures are expected today. Consider adding an extra layer."
    

The system should avoid repeating identical reminders.

---

# 9. Special Situations and Exception Handling

## 9.1 Missing Weather Data

When weather data is incomplete:

- Use only valid data that has already been obtained.
    
- Do not fabricate missing temperature information.
    
- If maximum and minimum daily feels-like temperatures are unavailable, do not determine that a large temperature variation exists.
    
- If rainfall forecasts are unavailable, do not claim that it will or will not rain.
    
- If the available data is still sufficient for a basic recommendation, generation may continue.
    
- If the data is insufficient, explain the limitation to the user.
    

## 9.2 Missing Rainfall Forecast

If rainfall forecasts are unavailable:

- Do not invent rainfall probabilities.
    
- Do not claim that it will or will not rain.
    
- Continue generating outfits based on valid temperature and occasion information when possible.
    

## 9.3 Missing Daily Temperature Variation Data

If the maximum, minimum, or average daily feels-like temperature is unavailable:

- Use the current feels-like temperature as a fallback.
    
- Do not activate the average-temperature assessment for large daily variations.
    
- Do not remind the user that there will be a large temperature difference without supporting data.
    

## 9.4 Unclear Occasion Information

If the user does not clearly specify the activity:

- Make a reasonable judgment based on the user's description.
    
- Do not classify the occasion as highly formal business wear without sufficient reason.
    
- For descriptions with multiple possible interpretations, choose the classification that best matches the user's original meaning.
    
- If the user provides specific activity requirements, prioritize those requirements.
    

## 9.5 Conflict Between Style and Occasion

If the user's style preference conflicts with the occasion:

- First determine whether there are explicit dress-code requirements.
    
- Preserve the user's style preference as much as possible while satisfying the occasion requirements.
    
- Appropriately reduce overly prominent style elements when necessary.
    
- Do not replace the user's preferred style with another style without explanation.
    
- If the available wardrobe cannot satisfy both requirements, explain the reason.
    

## 9.6 Missing Garment Style Tags

If some garments do not have style tags:

- Do not arbitrarily assign them a style.
    
- Make limited judgments based on known garment attributes.
    
- Reduce the confidence of the overall style-matching assessment.
    
- Do not exclude a garment solely because its style tags are missing.
    

## 9.7 Missing Garment Occasion Tags

If some garments do not have occasion tags:

- Do not arbitrarily assume that they are suitable for a specific occasion.
    
- Assess their suitability based on category, color, fit, thickness, material, and outfit knowledge.
    
- Do not exclude a garment solely because its occasion tags are missing.
    
- Evaluate suitability based on the complete outfit.
    

## 9.8 Missing Color Information

If a garment's color is missing or unclear:

- Do not invent its color.
    
- Reduce the confidence of the overall color assessment.
    
- Continue outfit assessment if the other requirements are satisfied.
    
- Do not automatically exclude a garment solely because its color information is incomplete.
    

## 9.9 Missing Garment Thickness Information

If a garment's thickness information is missing:

- Do not automatically assume that it provides sufficient warmth.
    
- Make limited judgments based on other known attributes.
    
- Be cautious when assessing temperature suitability.
    
- If essential warm clothing is missing, do not present the outfit as a complete recommendation for low-temperature conditions.
    

## 9.10 Insufficient Wardrobe Items

If the user's wardrobe cannot form a complete outfit:

- Explain how many valid outfits can currently be generated, if applicable.
    
- Clearly identify the missing garment categories.
    
- Do not present an incomplete combination as a complete outfit.
    
- Do not invent garments to fill missing categories.
    

---

# 10. Version History and Maintenance Principles

## 10.1 Version History

|Version|Updates|
|---|---|
|V1.0|Established the initial knowledge framework covering temperature, weather, occasion, color, outfit composition, and recommendation rules|
|V1.1|Added six basic outfit styles, a single-primary-style selection mechanism, and rules for matching occasion and style|
|V1.2|Updated the style and occasion tag systems; clarified that style and occasion are independent; added the two input methods for Current Preference; supplemented temperature suitability rules involving garment thickness, fit, and material|

## 10.2 Maintenance Principles

- Record the version and reason whenever rules are updated.
    
- Style tags and occasion tags must be maintained separately and must not be mixed.
    
- The wardrobe and outfit recommendation pages must use consistent fixed style and occasion tags.
    
- A garment may have multiple style tags and multiple occasion tags.
    
- A garment must not be excluded solely because it lacks a particular tag.
    
- Thickness participates in temperature suitability assessment, while fit and material serve as auxiliary factors.
    
- Color and style matching are mainly used for evaluation and ranking and should not easily override hard requirements.
    
- Clothing principles that may not apply to every user should retain flexibility.
    
- This knowledge base provides clothing knowledge and recommendation principles. It does not replace programmatic validation of actual garments, availability status, and outfit completeness.
    
- Current-round preference and occasion inputs are temporary recommendation conditions and must not automatically be saved as long-term preferences.
    

---

**End of Document**