Tower Survey Platform

A ServiceNow-powered platform for collecting and managing tower/pylon site survey data, designed to streamline field audits and asset management for telecommunications infrastructure.

 Overview

This platform leverages **ServiceNow's CMDB** and **Survey modules** to create a comprehensive solution for tower site surveys. It enables field teams to:

- Collect structured survey data for tower sites
- Link survey responses to specific Configuration Items (CIs) in the CMDB
- Track site conditions, equipment status, and compliance metrics
- Generate audit-ready reports from survey data

 Key Features

For Surveyors
- Mobile-friendly survey forms
- Quick lookup of tower sites by Tenant ID
- Photo attachment capabilities
- Offline data collection support

 For Managers
- Real-time survey completion tracking
- Automated data validation
- Integration with ServiceNow CMDB
- Customizable survey templates

 Technical Capabilities
- REST API integration with ServiceNow
- CMDB data synchronization
- Survey data analytics
- Export to common formats (CSV, PDF, Excel)

## Déploiement & pérennité des données

Voir `tower-survey-backend/README.md` → section **"Pérennité des liens photo"** pour
les règles critiques liées au stockage des photos d'audit :

- Volume persistant Railway **obligatoire** (sinon perte de toutes les photos à chaque redéploiement)
- Aucune suppression automatique des fichiers uploadés (preuves d'audit conservées indéfiniment)
- Si migration vers S3/MinIO : bucket **public en lecture seule**, jamais d'URLs signées expirantes
