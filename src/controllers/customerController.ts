import { Request, Response } from 'express';
import { supabaseService } from '../services/supabaseService';

export class CustomerController {
  // Upload CSV with customer list
  async uploadCustomers(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'CSV file is required'
        });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const customers = this.parseCSV(csvContent);

      if (customers.length === 0) {
        return res.status(400).json({
          error: 'No valid customers found in CSV'
        });
      }

      // Validate customers
      const validatedCustomers = this.validateCustomers(customers);
      const errors = validatedCustomers.filter(c => c.error);
      const validCustomers = validatedCustomers.filter(c => !c.error);

      if (validCustomers.length === 0) {
        return res.status(400).json({
          error: 'No valid customers found',
          details: errors
        });
      }

      // Insert customers into database
      const insertedCustomers = [];
      for (const customer of validCustomers) {
        try {
          const inserted = await supabaseService.createCustomer({
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone_number: customer.phone_number,
            company_name: customer.company_name,
            campaign_id: customer.campaign_id,
          });
          insertedCustomers.push(inserted);
        } catch (error) {
          console.error('Error inserting customer:', error);
          errors.push({
            ...customer,
            error: error instanceof Error ? error.message : 'Database error'
          });
        }
      }

      res.json({
        success: true,
        total: customers.length,
        inserted: insertedCustomers.length,
        errors: errors.length,
        customers: insertedCustomers,
        errorDetails: errors
      });

    } catch (error) {
      console.error('Upload customers error:', error);
      res.status(500).json({
        error: 'Failed to upload customers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get all customers
  async getCustomers(req: Request, res: Response) {
    try {
      const customers = await supabaseService.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({
        error: 'Failed to get customers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Create a single customer
  async createCustomer(req: Request, res: Response) {
    try {
      const { firstName, lastName, phoneNumber, companyName } = req.body;

      // Validate required fields
      if (!firstName || !phoneNumber) {
        return res.status(400).json({
          error: 'First name and phone number are required'
        });
      }

      // Validate phone number
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
        return res.status(400).json({
          error: 'Invalid phone number format'
        });
      }

      // Create customer in database
      const customer = await supabaseService.createCustomer({
        first_name: firstName,
        last_name: lastName || '',
        phone_number: phoneNumber,
        company_name: companyName || '',
      });

      res.json({
        success: true,
        customer: customer
      });
    } catch (error) {
      console.error('Create customer error:', error);
      res.status(500).json({
        error: 'Failed to create customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Parse CSV content
  private parseCSV(csvContent: string): any[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse headers
    const headers = this.parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const customers = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length !== headers.length) {
        console.warn(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}. Skipping.`);
        continue;
      }

      const customer: any = {};
      headers.forEach((header, index) => {
        customer[header] = values[index].trim();
      });
      customers.push(customer);
    }

    return customers;
  }

  // Parse CSV line handling quoted fields
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  // Validate customer data
  private validateCustomers(customers: any[]): any[] {
    return customers.map(customer => {
      const errors = [];

      // Required fields
      if (!customer.first_name || !customer.firstname) {
        errors.push('First name is required');
      }
      if (!customer.phone || !customer.phone_number) {
        errors.push('Phone number is required');
      }

      // Phone number validation
      const phoneNumber = customer.phone || customer.phone_number;
      if (phoneNumber) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
          errors.push('Invalid phone number format');
        }
      }

      return {
        first_name: customer.first_name || customer.firstname,
        last_name: customer.last_name || customer.lastname,
        phone_number: customer.phone || customer.phone_number,
        company_name: customer.company || customer.company_name,
        campaign_id: customer.campaign_id,
        error: errors.length > 0 ? errors.join(', ') : null
      };
    });
  }
}

export const customerController = new CustomerController();

