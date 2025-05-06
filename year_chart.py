import tkinter as tk
from tkinter import ttk
import global_func as gf

class Year_Chart:
    yearCharts = []
    year = None
    log = None
    yearSheet = None
    chart = None
    excelMan = None

    maxYear = None
    minYear = None

    def __init__(self, excelManager, log, year):
        self.excelMan = excelManager
        self.log = log
        self.year = year

    def read_cat_list(self, startRow, rowTitle, catList):
        lastRow = 0
        self.yearSheet.cell(column=1, row=startRow, value=rowTitle)
        for categoryInt in range(len(catList)):
            row = (categoryInt + startRow + 1)
            self.yearSheet.cell(column=1, row=row, value=catList[categoryInt])
            lastRow = row
        lastRow = lastRow + 1
        self.yearSheet.cell(column=1, row=lastRow, value="Total")
        return lastRow + 1
    
    def create_chart(self):
        self.yearSheet = self.excelMan.workbook.create_sheet(str(self.year))
        for monthInt in range(1, len(gf.months)+1):
            cell = (monthInt * 2)
            self.yearSheet.merge_cells(start_row=1, start_column=cell, end_row=1, end_column=cell+1)
            self.yearSheet.cell(row=1, column=cell, value = gf.months[monthInt - 1])
            self.yearSheet.cell(row=2, column=cell, value = "Expected")
            self.yearSheet.cell(row=2, column=cell+1, value = "Actual")
            continue
        lastRow = self.read_cat_list(3, "Input", gf.categoriesIn)
        lastRow = self.read_cat_list(lastRow, "Output", gf.categoriesOut)
        self.yearSheet.cell(column=1, row=lastRow, value="Overall Total")

        self.excelMan.workbook.save("Tracker.xlsx")
        
        
